import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIn, type IsoDate } from "@/lib/calendar/dates";
import { addWorkingDays, nextValidDate } from "@/lib/calendar/working-calendar";
import { loadCalendarContext } from "@/lib/calendar/context";
import { scheduleTouches } from "@/lib/caps/schedule";
import { loadPlanningContext, loadScheduledTouches } from "@/lib/campaigns/context";
import { datesForTriggeredTrack, tracksToStart } from "@/lib/campaigns/triggers";
import { ActionError, canEdit } from "@/lib/campaigns/actions";
import { logActivity } from "@/lib/activity/log";
import { hasUnresolvedToken, resolveTokens, tokenContext } from "@/lib/copy-tokens";
import { buildDraftMime, gmailDraftLink, toBase64Url } from "@/lib/google/mime";
import { createDraft, getThread, GoogleAuthError, senderFor, updateDraft } from "@/lib/google/gmail";
import { bodyText, stripQuoted } from "@/lib/responses/parse";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Executing steps from Today (PRD M5). Humans send every touch: these actions
 * prepare (a Gmail draft, text to copy) and record (done, skipped, snoozed).
 * Any teammate may mark a step done for someone else; it is logged as theirs.
 */

const OPEN_STEP = ["upcoming", "due", "overdue"];

async function loadStep(db: SupabaseClient, stepId: string) {
  const { data: step } = await db.from("steps").select("*").eq("id", stepId).is("deleted_at", null).maybeSingle();
  if (!step) throw new ActionError("Step not found", 404);
  const [{ data: campaign }, { data: contact }, { data: track }] = await Promise.all([
    db.from("campaigns").select("id, account_id, owner_id, status").eq("id", step.campaign_id).single(),
    db.from("contacts").select("id, full_name, title, email, linkedin_url, phone, bounced, do_not_contact, exclude, engagement_status").eq("id", step.contact_id).single(),
    db.from("contact_tracks").select("*").eq("id", step.track_id).single(),
  ]);
  const { data: account } = await db.from("accounts").select("id, name").eq("id", campaign!.account_id).single();
  return { step, campaign: campaign!, contact: contact!, track: track!, account: account! };
}

/** The text a person will actually send: edited body with tokens resolved. */
export async function preparedCopy(db: SupabaseClient, stepId: string) {
  const s = await loadStep(db, stepId);
  // The name the copy is signed with: the shared mailbox's person when there is one (Mouli writes as Sid).
  const from = s.step.assignee_id ? await senderFor(db, s.step.assignee_id).catch(() => null) : null;
  const sender = from ? { id: from.operatorId, name: from.name, email: from.email, mailboxId: from.mailboxId } : null;
  const ctx = tokenContext(s.contact, s.account.name, sender?.name ?? "");
  const subject = s.step.subject ? resolveTokens(s.step.subject, ctx) : null;
  const body = resolveTokens((s.step.channel === "call" ? s.step.call_script : s.step.body) ?? "", ctx);
  const unresolved = hasUnresolvedToken(`${subject ?? ""}\n${body}`);
  return { ...s, sender, subject, body, unresolved };
}

export async function createGmailDraftForStep(db: SupabaseClient, user: SessionUser, stepId: string) {
  const p = await preparedCopy(db, stepId);
  if (p.step.channel !== "email") throw new ActionError("Only email steps create Gmail drafts");
  if (!OPEN_STEP.includes(p.step.status)) throw new ActionError("This step is already closed");
  if (p.step.assignee_id !== user.id) throw new ActionError(`This email is sent by ${p.sender?.name ?? "someone else"}, so the draft goes in their Gmail. Ask them, or reassign the step to yourself.`, 403);
  if (p.contact.do_not_contact || p.contact.exclude) throw new ActionError("This contact is marked do not contact");
  if (!p.contact.email || p.contact.bounced) throw new ActionError("This contact has no working email. Switch the step to LinkedIn.");
  if (p.unresolved) throw new ActionError("Fix the placeholder in the copy before creating the draft");
  if (!p.subject?.trim()) throw new ActionError("Add a subject first");

  const from = await senderFor(db, p.step.assignee_id);
  let token: string;
  try {
    token = await from.token();
  } catch (e) {
    throw new ActionError((e as GoogleAuthError).message, 409);
  }
  const raw = toBase64Url(buildDraftMime({ from: `${from.name} <${from.email}>`, to: p.contact.email, toName: p.contact.full_name, subject: p.subject, body: p.body }));

  // One draft per step, always: update the existing draft rather than make a second.
  let draft = p.step.gmail_draft_id ? await updateDraft(token, p.step.gmail_draft_id, raw, p.step.gmail_thread_id) : null;
  if (!draft) draft = await createDraft(token, raw, p.step.gmail_thread_id);

  await db.from("steps").update({
    gmail_draft_id: draft.id,
    gmail_message_id: draft.message.id,
    gmail_thread_id: draft.message.threadId,
    sent_body: null,
  }).eq("id", stepId);
  await logActivity(db, { entityType: "step", entityId: stepId, action: "gmail_draft_created", actorId: user.id, after: { draftId: draft.id } });
  return { draftId: draft.id, link: gmailDraftLink(from.email, draft.message.id), from: from.email, fromName: from.name };
}

export async function markDone(db: SupabaseClient, user: SessionUser, stepId: string, opts: { note?: string | null; callOutcome?: "connected" | "voicemail" | "no_answer" | null; sentBody?: string | null } = {}) {
  const s = await loadStep(db, stepId);
  if (!OPEN_STEP.includes(s.step.status)) throw new ActionError("This step is already closed");
  const now = new Date().toISOString();
  const before = { status: s.step.status, completed_at: null, completed_by: null, outcome_note: s.step.outcome_note, call_outcome: s.step.call_outcome };

  await db.from("steps").update({
    status: "done",
    completed_at: now,
    completed_by: user.id,
    outcome_note: opts.note?.slice(0, 500) ?? null,
    call_outcome: opts.callOutcome ?? null,
    ...(opts.sentBody ? { sent_body: opts.sentBody } : {}),
  }).eq("id", stepId);

  // Track and contact roll-ups.
  const { data: open } = await db.from("steps").select("due_date").eq("track_id", s.track.id).in("status", OPEN_STEP).is("deleted_at", null).order("due_date").limit(1);
  const done = (s.track.current_step_no ?? 0) + 1;
  await db.from("contact_tracks").update({
    current_step_no: Math.max(done, s.step.sequence_no),
    last_touch_at: now,
    next_step_at: open?.[0]?.due_date ?? null,
    status: open?.length ? s.track.status : s.track.status === "active" ? "completed" : s.track.status,
  }).eq("id", s.track.id);
  if (s.contact.engagement_status === "not_contacted") await db.from("contacts").update({ engagement_status: "contacted" }).eq("id", s.contact.id);

  await logActivity(db, { entityType: "step", entityId: stepId, action: "done", actorId: user.id, before, after: { status: "done", onBehalfOf: s.step.assignee_id !== user.id ? s.step.assignee_id : undefined } });
  const started = await startWaitingTracks(db, s.campaign.id, { kind: "step_done", contactId: s.contact.id, sequenceNo: s.step.sequence_no }, todayIn());
  return { started };
}

export async function skipStep(db: SupabaseClient, user: SessionUser, stepId: string, reason: string) {
  const s = await loadStep(db, stepId);
  if (!OPEN_STEP.includes(s.step.status)) throw new ActionError("This step is already closed");
  if (!canEdit(user, s.campaign.owner_id) && s.step.assignee_id !== user.id) throw new ActionError("Only the sender, owner, admins or the manager can skip this step", 403);
  if (!reason.trim()) throw new ActionError("Say why you're skipping it");
  await db.from("steps").update({ status: "skipped", skip_reason: reason.slice(0, 300) }).eq("id", stepId);
  await logActivity(db, { entityType: "step", entityId: stepId, action: "skipped", actorId: user.id, before: { status: s.step.status, skip_reason: s.step.skip_reason }, after: { status: "skipped", skip_reason: reason } });
}

export async function snoozeStep(db: SupabaseClient, user: SessionUser, stepId: string, days: 1 | 2 | 3) {
  const s = await loadStep(db, stepId);
  if (!OPEN_STEP.includes(s.step.status)) throw new ActionError("This step is already closed");
  if (![1, 2, 3].includes(days)) throw new ActionError("Snooze is 1, 2 or 3 working days");
  const today = todayIn();
  const { data: contact } = await db.from("contacts").select("country").eq("id", s.contact.id).single();
  const ctx = await loadCalendarContext(db, [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
  const scope = { country: contact?.country, assigneeId: s.step.assignee_id };
  const from: IsoDate = !s.step.due_date || s.step.due_date < today ? today : s.step.due_date;
  const date = addWorkingDays(from, days, scope, ctx);
  const before = { due_date: s.step.due_date, scheduled_date: s.step.scheduled_date, status: s.step.status, snooze_count: s.step.snooze_count };
  await db.from("steps").update({ due_date: date, scheduled_date: date, status: "upcoming", snooze_count: (s.step.snooze_count ?? 0) + 1 }).eq("id", stepId);
  await logActivity(db, { entityType: "step", entityId: stepId, action: "snoozed", actorId: user.id, before, after: { due_date: date } });
  return { date };
}

/** 10-second undo for done, skip and snooze: restores the step from the activity log. */
export async function undoStepAction(db: SupabaseClient, user: SessionUser, stepId: string) {
  const { data: last } = await db.from("activity_log").select("id, action, before, at, actor_id")
    .eq("entity_type", "step").eq("entity_id", stepId).in("action", ["done", "skipped", "snoozed"])
    .order("at", { ascending: false }).limit(1).maybeSingle();
  if (!last || last.actor_id !== user.id || Date.now() - new Date(last.at).getTime() > 120_000) throw new ActionError("Nothing to undo");
  await db.from("steps").update(last.before as Record<string, unknown>).eq("id", stepId);
  await logActivity(db, { entityType: "step", entityId: stepId, action: `undo_${last.action}`, actorId: user.id, after: last.before });
}

/** Starts tracks waiting on a reply or a finished step: real dates, caps and collisions applied. */
export async function startWaitingTracks(db: SupabaseClient, campaignId: string, event: Parameters<typeof tracksToStart>[1], eventDate: IsoDate) {
  const { data: waiting } = await db.from("contact_tracks").select("id, contact_id, assignee_id, start_trigger_type, trigger_from_contact_id, trigger_step_index, delay_working_days")
    .eq("campaign_id", campaignId).eq("status", "not_started").neq("start_trigger_type", "fixed");
  const ids = tracksToStart((waiting ?? []).map((t) => ({ trackId: t.id, type: t.start_trigger_type, fromContactId: t.trigger_from_contact_id, stepIndex: t.trigger_step_index })), event);
  if (!ids.length) return 0;

  const p = await loadPlanningContext(db);
  const existing = await loadScheduledTouches(db, p.today);
  const { data: campaign } = await db.from("campaigns").select("account_id").eq("id", campaignId).single();

  for (const t of (waiting ?? []).filter((w) => ids.includes(w.id))) {
    const { data: steps } = await db.from("steps").select("id, offset_working_days, channel, assignee_id").eq("track_id", t.id).is("deleted_at", null).in("status", OPEN_STEP);
    const { data: contact } = await db.from("contacts").select("country").eq("id", t.contact_id).single();
    const scope = { country: contact?.country, assigneeId: t.assignee_id };
    const from = nextValidDate(eventDate < p.today ? p.today : eventDate, {}, p.ctx);
    const planned = datesForTriggeredTrack((steps ?? []).map((s) => ({ id: s.id, offset: s.offset_working_days ?? 0 })), from, t.delay_working_days ?? 2, scope, p.ctx);
    const { scheduled } = scheduleTouches(
      planned.steps.map((x) => ({ key: x.id, date: x.date, contactId: t.contact_id, accountId: campaign!.account_id, assigneeId: steps!.find((s) => s.id === x.id)!.assignee_id ?? t.assignee_id, channel: steps!.find((s) => s.id === x.id)!.channel, country: contact?.country })),
      existing,
      p.caps,
      p.ctx,
    );
    for (const sch of scheduled) {
      await db.from("steps").update({ due_date: sch.date, scheduled_date: sch.date, original_date: sch.movedFrom ?? sch.date, moved_reason: sch.movedFrom ? `Moved from ${sch.movedFrom} (team limits)` : null }).eq("id", sch.key);
      existing.push(sch);
    }
    await db.from("contact_tracks").update({ status: "active", start_date: scheduled[0]?.date ?? planned.startDate, next_step_at: scheduled[0]?.date ?? null }).eq("id", t.id);
    if (t.assignee_id) await db.from("notifications").insert({ user_id: t.assignee_id, type: "track_started", entity_type: "contact_track", entity_id: t.id, message: "A waiting track just started" });
  }
  return ids.length;
}

/**
 * Send in Gmail: after the compose pop-up opens, the page asks this every few
 * seconds. The moment the draft's thread holds a sent message, the step is
 * Done (with the text actually sent) and Done today goes up.
 */
export async function checkStepSent(db: SupabaseClient, user: SessionUser, stepId: string) {
  const { data: step } = await db.from("steps").select("id, status, assignee_id, gmail_thread_id, channel").eq("id", stepId).maybeSingle();
  if (!step) throw new ActionError("Step not found", 404);
  if (step.status === "done") return { sent: true, already: true };
  if (step.channel !== "email" || !step.gmail_thread_id || !step.assignee_id) return { sent: false };
  let token: string;
  try {
    token = await (await senderFor(db, step.assignee_id)).token();
  } catch (e) {
    throw new ActionError((e as GoogleAuthError).message, 409);
  }
  const thread = await getThread(token, step.gmail_thread_id);
  const sentMsg = thread?.messages.find((m) => m.labelIds?.includes("SENT") && !m.labelIds?.includes("DRAFT"));
  if (!sentMsg) return { sent: false };
  const res = await markDone(db, user, stepId, { sentBody: stripQuoted(bodyText(sentMsg.payload)) || null, note: "Sent from Gmail" });
  await db.from("steps").update({ gmail_message_id: sentMsg.id }).eq("id", stepId);
  return { sent: true, started: res.started };
}
