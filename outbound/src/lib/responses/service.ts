import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIn } from "@/lib/calendar/dates";
import { callClaude } from "@/lib/claude/client";
import { buildClassifyPayload, buildReplanPayload, contactRefs, namesForRefs } from "@/lib/claude/payload";
import { CampaignSchema, ClassifySchema, type Classification } from "@/lib/claude/schemas";
import { validateCampaign } from "@/lib/claude/validate";
import { finishStep } from "@/lib/writing/finish";
import { firstNameOf } from "@/lib/writing/compose";
import { loadSigners } from "@/lib/writing/rules";
import { loadReplanHistory } from "@/lib/responses/history";
import { playForAccount, playPayload } from "@/lib/playbook/payload";
import { loadPlanningContext, loadScheduledTouches, planningWindow, teamLoadPayload, teamPayload, writingFor, styleFor, focusFor } from "@/lib/campaigns/context";
import { accountForPayload, insertTracks } from "@/lib/campaigns/generate";
import { ActionError, canEdit } from "@/lib/campaigns/actions";
import { assertBudget } from "@/lib/claude/budget";
import { startWaitingTracks } from "@/lib/steps/execute";
import { logActivity } from "@/lib/activity/log";
import { normalizeLinkedIn } from "@/lib/sheet-sync/identity";
import type { SessionUser } from "@/lib/auth/session";
import { effectOf, needsReview, shiftPastReturn, switchEmailsToLinkedIn } from "./rules";
import { diffPlans, type PlanStep } from "./diff";
import { notifyResponse } from "./notify";

/**
 * Responses (PRD M6, M10). Detected replies wait as confirm cards; nothing
 * changes until a person confirms. Manual logs are confirmed on entry.
 */

const OPEN_STEP = ["upcoming", "due", "overdue"];
const LIVE = ["active", "paused", "responded", "meeting_booked"];

export type DetectedInput = {
  gmailMessageId: string;
  fromAddress: string;
  receivedAt: string;
  text: string;
  threadContext: string | null;
  accountId: string;
  contactId: string | null;
  bounce?: boolean;
};

/** Saves a detected reply as a pending card, classified by Claude when possible. Idempotent per Gmail message. */
export async function recordDetected(db: SupabaseClient, d: DetectedInput) {
  const { data: exists } = await db.from("responses").select("id").eq("gmail_message_id", d.gmailMessageId).maybeSingle();
  if (exists) return { id: exists.id as string, created: false };

  const { data: campaign } = await db.from("campaigns").select("id").eq("account_id", d.accountId).is("deleted_at", null).in("status", LIVE).maybeSingle();
  let track: { id: string } | null = null;
  if (campaign && d.contactId) {
    const { data } = await db.from("contact_tracks").select("id").eq("campaign_id", campaign.id).eq("contact_id", d.contactId).maybeSingle();
    track = data;
  }

  let classification: Classification | null = d.bounce ? "bounce" : null;
  let confidence: number | null = d.bounce ? 1 : null;
  let summary = d.bounce ? "Email bounced." : "New reply. Open it to classify.";
  let returnDate: string | null = null;
  let referredTo: string | null = null;
  let suggested: string | null = null;

  if (!d.bounce && process.env.ANTHROPIC_API_KEY) {
    const p = await loadPlanningContext(db);
    const { data: known } = await db.from("contacts").select("id, full_name, email, title").eq("account_id", d.accountId);
    const res = await callClaude({
      kind: "classify_reply",
      model: p.settings.default_model,
      skillText: p.skill.text,
      payload: buildClassifyPayload({ today: todayIn(), message: d.text, fromAddress: d.fromAddress, knownContacts: (known ?? []).map((k) => ({ contact_id: k.id, name: k.full_name, email: k.email, title: k.title })), threadContext: d.threadContext }),
      schema: ClassifySchema,
    });
    await db.from("claude_calls").insert({ call_type: "classify_reply", account_id: d.accountId, model: res.model, status: res.ok ? "ok" : "failed", attempts: res.attempts, input_tokens: res.usage?.input ?? null, output_tokens: res.usage?.output ?? null, cost_usd: res.usage?.costUsd ?? null, error: res.ok ? null : res.message });
    if (res.ok) {
      ({ classification, confidence, summary } = res.data);
      returnDate = res.data.return_date;
      referredTo = res.data.referred_to;
      suggested = res.data.suggested_next_step;
    }
  }

  const { data: row, error } = await db.from("responses").insert({
    campaign_id: campaign?.id ?? null,
    track_id: track?.id ?? null,
    account_id: d.accountId,
    contact_id: d.contactId,
    channel: "email",
    received_at: d.receivedAt,
    source: "detected",
    classification,
    confidence,
    needs_review: classification !== "bounce" && needsReview(confidence),
    summary: summary.slice(0, 300),
    raw_text: d.text.slice(0, 20000),
    return_date: returnDate,
    referred_to: referredTo,
    suggested_next_step: suggested,
    from_address: d.fromAddress,
    gmail_message_id: d.gmailMessageId,
    state: "pending",
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return { id: null, created: false }; // another run recorded it first
    throw new Error(error.message);
  }

  // A reply arriving while a re-plan is open makes that plan stale (PRD section 11).
  if (campaign) await db.from("replan_drafts").update({ state: "stale" }).eq("campaign_id", campaign.id).eq("state", "open");
  await notifyResponse(db, row.id);
  return { id: row.id as string, created: true };
}

export async function confirmResponse(db: SupabaseClient, user: SessionUser, responseId: string, opts: { classification?: Classification; pauseOtherTracks?: boolean } = {}) {
  const { data: r } = await db.from("responses").select("*").eq("id", responseId).maybeSingle();
  if (!r) throw new ActionError("Response not found", 404);
  if (r.state !== "pending") throw new ActionError("This response was already handled");
  const classification = (opts.classification ?? r.classification) as Classification | null;
  if (!classification) throw new ActionError("Pick what kind of response this is first");
  await db.from("responses").update({ classification, state: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString(), needs_review: false }).eq("id", responseId);
  await applyEffect(db, user, { ...r, classification }, !!opts.pauseOtherTracks);
  await logActivity(db, { entityType: "response", entityId: responseId, action: "confirmed", actorId: user.id, before: { classification: r.classification }, after: { classification } });
  return { needsReplan: effectOf(classification).needsReplan && !!r.campaign_id };
}

export async function dismissResponse(db: SupabaseClient, user: SessionUser, responseId: string) {
  await db.from("responses").update({ state: "dismissed", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("id", responseId).eq("state", "pending");
  await logActivity(db, { entityType: "response", entityId: responseId, action: "dismissed", actorId: user.id });
}

/** Log response button: LinkedIn, call or anything detection can't see. Confirmed on entry. */
export async function logManualResponse(db: SupabaseClient, user: SessionUser, d: { contactId: string; channel: string; classification: Classification; text?: string | null; ownerNextStep?: string | null; pauseOtherTracks?: boolean }) {
  const { data: contact } = await db.from("contacts").select("id, account_id, email").eq("id", d.contactId).maybeSingle();
  if (!contact) throw new ActionError("Contact not found", 404);
  const { data: campaign } = await db.from("campaigns").select("id").eq("account_id", contact.account_id).is("deleted_at", null).in("status", LIVE).maybeSingle();
  const { data: track } = campaign ? await db.from("contact_tracks").select("id").eq("campaign_id", campaign.id).eq("contact_id", contact.id).maybeSingle() : { data: null };
  const { data: row, error } = await db.from("responses").insert({
    campaign_id: campaign?.id ?? null, track_id: track?.id ?? null, account_id: contact.account_id, contact_id: contact.id,
    channel: d.channel, received_at: new Date().toISOString(), source: "manual", classification: d.classification, confidence: 1,
    needs_review: false, summary: (d.text ?? "").slice(0, 200) || `Logged ${d.classification.replace("_", " ")} on ${d.channel.replace("_", " ")}`,
    raw_text: d.text ?? null, owner_next_step: d.ownerNextStep ?? null, state: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString(),
  }).select("*").single();
  if (error || !row) throw new ActionError(error?.message ?? "Could not log the response", 500);
  await applyEffect(db, user, row, !!d.pauseOtherTracks);
  await logActivity(db, { entityType: "response", entityId: row.id, action: "logged", actorId: user.id, after: { classification: d.classification, channel: d.channel } });
  if (campaign) await db.from("replan_drafts").update({ state: "stale" }).eq("campaign_id", campaign.id).eq("state", "open");
  await notifyResponse(db, row.id);
  return { id: row.id as string, needsReplan: effectOf(d.classification).needsReplan && !!campaign };
}

type ResponseRow = { id: string; campaign_id: string | null; track_id: string | null; contact_id: string | null; account_id: string | null; classification: Classification; return_date: string | null; from_address: string | null };

async function applyEffect(db: SupabaseClient, user: SessionUser, r: ResponseRow, pauseOthers: boolean) {
  const e = effectOf(r.classification);
  const today = todayIn();

  if (r.contact_id) {
    const { data: contact } = await db.from("contacts").select("id, email, linkedin_url, engagement_status, country").eq("id", r.contact_id).single();
    if (e.contactEngagement && contact && contact.engagement_status !== "meeting") await db.from("contacts").update({ engagement_status: e.contactEngagement }).eq("id", r.contact_id);

    if (e.doNotContact && contact) {
      await db.from("contacts").update({ do_not_contact: true }).eq("id", r.contact_id);
      // Global and permanent: no sheet sync can bring this person back.
      const li = normalizeLinkedIn(contact.linkedin_url);
      // The unique indexes are partial, so check first instead of upserting.
      const [{ data: byEmail }, { data: byLi }] = await Promise.all([
        contact.email ? db.from("do_not_contact").select("id").eq("email", contact.email).maybeSingle() : Promise.resolve({ data: null }),
        li ? db.from("do_not_contact").select("id").eq("linkedin_url", li).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!byEmail && !byLi && (contact.email || li)) {
        const { error } = await db.from("do_not_contact").insert({ email: contact.email ?? null, linkedin_url: li, reason: r.classification, source_response_id: r.id, created_by: user.id });
        if (error && error.code !== "23505") throw new Error(`Could not add to do not contact: ${error.message}`);
      }
      // Stop every open step to this person, in any campaign.
      await db.from("steps").update({ status: "skipped", skip_reason: `Contact asked: ${r.classification.replace("_", " ")}` }).eq("contact_id", r.contact_id).in("status", OPEN_STEP);
    }

    if (e.bounced && contact) {
      await db.from("contacts").update({ bounced: true }).eq("id", r.contact_id);
      const { data: open } = await db.from("steps").select("id, channel, due_date").eq("contact_id", r.contact_id).in("status", OPEN_STEP).is("deleted_at", null);
      const hasConnect = (open ?? []).some((s) => s.channel === "linkedin_connect") || !!(await db.from("steps").select("id").eq("contact_id", r.contact_id).eq("channel", "linkedin_connect").eq("status", "done").limit(1)).data?.length;
      if (contact.linkedin_url) {
        for (const sw of switchEmailsToLinkedIn((open ?? []).map((s) => ({ id: s.id, channel: s.channel, date: s.due_date })), hasConnect)) {
          await db.from("steps").update({ channel: sw.channel, subject: null, moved_reason: "Switched from email after a bounce. Review the copy." }).eq("id", sw.id);
        }
      } else {
        await db.from("steps").update({ status: "skipped", skip_reason: "Email bounced and there is no LinkedIn URL" }).eq("contact_id", r.contact_id).eq("channel", "email").in("status", OPEN_STEP);
      }
    }

    if (e.shiftForReturnDate && r.return_date && r.track_id) {
      const { loadCalendarContext } = await import("@/lib/calendar/context");
      const ctx = await loadCalendarContext(db, [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
      const { data: open } = await db.from("steps").select("id, due_date, assignee_id").eq("track_id", r.track_id).in("status", OPEN_STEP).not("due_date", "is", null);
      const shifted = shiftPastReturn((open ?? []).map((s) => ({ id: s.id, date: s.due_date! })), r.return_date, { country: contact?.country, assigneeId: open?.[0]?.assignee_id }, ctx);
      for (const s of shifted.filter((x) => x.movedFrom)) {
        await db.from("steps").update({ due_date: s.date, scheduled_date: s.date, moved_from_date: s.movedFrom, moved_reason: `Moved from ${s.movedFrom} (out of office until ${r.return_date})` }).eq("id", s.id);
      }
    }
  }

  if (r.track_id && e.trackStatus) {
    await db.from("contact_tracks").update({ status: e.trackStatus, pause_reason: `Response: ${r.classification.replace("_", " ")}` }).eq("id", r.track_id);
  }
  if (r.campaign_id) {
    if (e.campaignStatus) await db.from("campaigns").update({ status: e.campaignStatus }).eq("id", r.campaign_id).in("status", ["active", "paused", "responded"]);
    if (pauseOthers && e.askPauseOthers) {
      const { data: paused } = await db.from("contact_tracks").update({ status: "paused", pause_reason: "Positive reply" }).eq("campaign_id", r.campaign_id).neq("id", r.track_id ?? "").in("status", ["active", "not_started"]).select("id");
      if (paused?.length) {
        const { postAccountNote } = await import("@/lib/slack/posts");
        await postAccountNote(db, r.account_id!, `pause-positive-${r.id}`, `Positive reply: ${paused.length} other track${paused.length === 1 ? "" : "s"} paused.`);
      }
    }
    if (e.startReplyTriggers && r.contact_id) await startWaitingTracks(db, r.campaign_id, { kind: "reply", contactId: r.contact_id }, today);
  }
  if (r.account_id) {
    const { refreshPriorities } = await import("@/lib/jobs/daily");
    await refreshPriorities(db, r.account_id);
  }
}

// ---------------------------------------------------------------------------
// Re-plan with Claude
// ---------------------------------------------------------------------------

async function planStepsFor(db: SupabaseClient, campaignId: string): Promise<{ done: unknown[]; open: PlanStep[]; tracks: unknown[] }> {
  const [{ data: steps }, { data: tracks }] = await Promise.all([
    db.from("steps").select("id, contact_id, sequence_no, channel, due_date, offset_working_days, subject, body, sent_body, status, completed_at").eq("campaign_id", campaignId).is("deleted_at", null).neq("status", "superseded"),
    db.from("contact_tracks").select("id, contact_id, persona, track_goal, status, start_trigger_type, trigger_from_contact_id, delay_working_days, assignee_id").eq("campaign_id", campaignId),
  ]);
  const done = (steps ?? []).filter((s) => ["done", "skipped"].includes(s.status)).map((s) => ({ contact_ref: s.contact_id, date: s.completed_at?.slice(0, 10) ?? s.due_date, channel: s.channel, status: s.status, subject: s.subject, sent_body: s.sent_body ?? s.body }));
  const open = (steps ?? []).filter((s) => OPEN_STEP.includes(s.status)).map((s) => ({ contactId: s.contact_id, sequenceNo: s.sequence_no, channel: s.channel, date: s.due_date, offset: s.offset_working_days, subject: s.subject, body: s.body }));
  return { done, open, tracks: (tracks ?? []).map((t) => ({ ...t, steps: (steps ?? []).filter((s) => s.contact_id === t.contact_id).map((s) => ({ channel: s.channel, date: s.due_date, status: s.status, subject: s.subject, body: s.body, sent_body: s.sent_body })) })) };
}

export async function requestReplan(db: SupabaseClient, user: SessionUser, d: { campaignId: string; responseId: string | null; ownerNextStep: string | null; scope: "track" | "campaign" }) {
  const { data: c } = await db.from("campaigns").select("*").eq("id", d.campaignId).single();
  if (!c) throw new ActionError("Campaign not found", 404);
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can re-plan", 403);
  await assertBudget(db, "re-plan");
  const p = await loadPlanningContext(db);
  if (!p.skill.text) throw new ActionError("No campaign skill is set. Paste it in Settings > Claude.");
  if (!process.env.ANTHROPIC_API_KEY) throw new ActionError("Claude is not connected yet (ANTHROPIC_API_KEY). Edit the steps by hand for now.");

  const { data: account } = await db.from("accounts").select("*").eq("id", c.account_id).single();
  const { data: contacts } = await db.from("contacts").select("id, full_name, title, persona, email, email_status, linkedin_url, phone, country, notes, linkedin_signals, exclude, do_not_contact, bounced, engagement_status").eq("account_id", c.account_id).is("deleted_at", null);
  const { data: resp } = d.responseId ? await db.from("responses").select("*").eq("id", d.responseId).single() : { data: null };
  const owner = p.users.find((u) => u.id === c.owner_id)!;
  const win = planningWindow(p);
  const touches = (await loadScheduledTouches(db, p.today)).filter((t) => t.accountId !== c.account_id);
  const current = await planStepsFor(db, c.id);
  const refs = contactRefs((contacts ?? []).map((x) => x.id));
  const refTracks = (current.tracks as Array<Record<string, unknown>>).map((t) => ({ ...t, id: undefined, assignee_id: undefined, contact_id: refs.ref(t.contact_id as string), trigger_from_contact_id: refs.ref(t.trigger_from_contact_id as string | null) }));
  const refDone = (current.done as Array<Record<string, unknown>>).map((d) => ({ ...d, contact_ref: refs.ref(d.contact_ref as string) }));

  // What has already happened, and the signals as they stand now, so the new plan builds on both.
  const history = await loadReplanHistory(db, c.id, c.account_id, refs);
  const { data: lastVersion } = await db.from("campaign_versions").select("created_at").eq("campaign_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: freshVendor } = await db.from("account_signals").select("signal_id, seen_on").eq("account_id", c.account_id).eq("source", "vendor").eq("expired", false).gt("ingested_at", (lastVersion?.created_at as string | undefined) ?? c.created_at);
  const replanPlay = (() => {
    const pp = playPayload(playForAccount(account as { signals: string | null; vendor_signals: string | null; outreach_angle: string | null; archived: boolean | null; icp_verdict: string | null; do_not_contact: boolean | null }, p.today));
    const fresh = new Set((freshVendor ?? []).map((v) => `${v.signal_id}|${v.seen_on}`));
    return { play: pp.play, signals: pp.signals.map((sg) => (fresh.has(`${sg.id}|${sg.seen_on}`) ? { ...sg, new_since_plan: true } : sg)) };
  })();
  const payload = buildReplanPayload({
    today: p.today, campaignStartDate: win.start, validWorkingDates: win.validWorkingDates,
    account: accountForPayload(account), contacts: (contacts ?? []).map((x) => ({ contact_id: refs.ref(x.id)!, name: x.full_name, title: x.title, persona: x.persona, email: x.bounced ? null : x.email, email_status: x.email_status, linkedin_url: x.linkedin_url, has_phone: !!x.phone, engagement: x.engagement_status as string | null, validation_focus: styleFor(p, owner) === "founder" ? focusFor(p, (c.play as "A1" | "A2" | "A3" | null) ?? null, x.persona as string | null, account.name as string) : undefined, country: x.country, notes: x.notes, linkedin_signals: x.linkedin_signals ?? {}, exclude: x.exclude, do_not_contact: x.do_not_contact })),
    owner: owner.key, team: teamPayload(p, win.start, win.end), teamLoad: teamLoadPayload(p, touches), caps: p.caps, approvedProofPoints: p.proofPoints, ownerNotes: null, writing: writingFor(p, owner, (contacts ?? []).map((x) => x.persona as string | null)), style: styleFor(p, owner), validation: { small_group: p.writing.validation.smallGroup },
    currentCampaign: { name: c.name, objective: c.objective, angle: c.angle, job: c.job, tracks: refTracks },
    completedSteps: refDone,
    response: { contact: refs.ref(resp?.contact_id) ?? "", channel: resp?.channel ?? "email", classification: resp?.classification ?? null, summary: resp?.summary ?? null, raw_text: resp?.raw_text ?? null },
    ownerNextStep: d.ownerNextStep, scope: d.scope,
    history, play: replanPlay.play, signals: replanPlay.signals,
  });
  const model = account.tier === "A" ? p.settings.tier_a_model : p.settings.default_model;
  // Re-plans keep the play the draft was written for, so the same kit guides the new steps.
  const res = await callClaude({ kind: "replan_campaign", model, skillText: p.skill.text, payload, schema: CampaignSchema, play: (c.play as "A1" | "A2" | "A3" | null) ?? null });
  await db.from("claude_calls").insert({ call_type: "replan_campaign", account_id: c.account_id, campaign_id: c.id, model: res.model, status: res.ok ? "ok" : "failed", attempts: res.attempts, input_tokens: res.usage?.input ?? null, output_tokens: res.usage?.output ?? null, cost_usd: res.usage?.costUsd ?? null, error: res.ok ? null : res.message, raw_output: res.rawText, requested_by: user.id });
  if (!res.ok) throw new ActionError(res.message, 502);

  const validated = validateCampaign(res.data, {
    accountId: c.account_id, ownerId: c.owner_id, refs: refs.toId,
    contacts: (contacts ?? []).map((x) => ({ id: x.id, email: x.email, hasEmail: !!x.email && !x.bounced, hasLinkedIn: !!x.linkedin_url, country: x.country, excluded: x.exclude, doNotContact: x.do_not_contact })),
    users: p.users.map((u) => ({ id: u.id, key: u.key, active: u.active })),
    campaignStartDate: win.start, caps: p.caps, existingTouches: touches, ctx: p.ctx,
    connectedContactIds: new Set(history.steps_taken.filter((x) => x.channel === "linkedin_connect" && x.result === "done").map((x) => refs.toId.get(String(x.contact_ref)) as string).filter(Boolean)),
  });
  // Track scope: only the person who replied changes. Anything else Claude
  // returned is ignored, and the diff compares that one person's steps.
  const only = d.scope === "track" && resp?.contact_id ? resp.contact_id : null;
  if (only) validated.tracks = validated.tracks.filter((t) => t.contactId === only);
  // Whatever Claude wrote, history wins: never repeat a connect request already sent, and never plan more
  // touches for someone who asked us to stop or told us we have the wrong person.
  const alreadyConnected = new Set(history.steps_taken.filter((x) => x.channel === "linkedin_connect" && x.result === "done").map((x) => x.contact_ref as string));
  const stopped = new Set(history.replies_and_responses.filter((x) => ["unsubscribe", "wrong_person"].includes(String(x.kind))).map((x) => x.contact_ref as string));
  for (const t of validated.tracks) {
    const ref = refs.ref(t.contactId) as string;
    t.steps = stopped.has(ref) ? [] : t.steps.filter((st) => !(st.channel === "linkedin_connect" && alreadyConnected.has(ref)));
  }
  const oldOpen = only ? current.open.filter((s) => s.contactId === only) : current.open;
  // Finish every new message the same way a first draft is finished (greeting, paragraphs, the right signature),
  // so the comparison shows real changes and what is applied is complete.
  const firstOf = new Map((contacts ?? []).map((x) => [x.id as string, firstNameOf(x.full_name as string)]));
  const signers = await loadSigners(db, validated.tracks.flatMap((t) => t.steps.map((st) => st.assigneeId).filter((v): v is string => !!v)));
  for (const t of validated.tracks) for (const st of t.steps) st.body = finishStep(st.channel, st.body, { firstName: firstOf.get(t.contactId) ?? null, assigneeId: st.assigneeId }, signers);
  const next: PlanStep[] = validated.tracks.flatMap((t) => t.steps.map((s) => ({ contactId: t.contactId, sequenceNo: s.sequenceNo, channel: s.channel, date: s.date, offset: s.offsetWorkingDays, subject: s.subject, body: s.body })));

  const names = new Map((contacts ?? []).map((x) => [x.id, x.full_name as string]));
  const nm = <T extends string | null>(t: T) => namesForRefs(t, refs.toId, names) as T;
  res.data.change_summary = nm(res.data.change_summary);
  validated.blocking = validated.blocking.map((b) => ({ ...b, text: nm(b.text) }));
  validated.notes = validated.notes.map((n) => ({ ...n, text: nm(n.text) }));
  validated.tracks = validated.tracks.map((t) => ({ ...t, rationale: nm(t.rationale), goal: nm(t.goal) }));

  await db.from("replan_drafts").update({ state: "discarded" }).eq("campaign_id", c.id).eq("state", "open");
  const { data: draft } = await db.from("replan_drafts").insert({
    campaign_id: c.id, scope: d.scope, response_id: d.responseId, created_by: user.id, state: "open",
    claude_output: { output: res.data, validated, diff: diffPlans(oldOpen, next), model: res.model, payload },
  }).select("id").single();
  await logActivity(db, { entityType: "campaign", entityId: c.id, action: "replan_requested", actorId: user.id, after: { draftId: draft?.id } });
  return { draftId: draft!.id as string };
}

/** Applies an open re-plan: new version, old open steps Superseded, done steps untouched. */
export async function applyReplan(db: SupabaseClient, user: SessionUser, draftId: string, contactIds?: string[]) {
  const { data: draft } = await db.from("replan_drafts").select("*").eq("id", draftId).single();
  if (!draft) throw new ActionError("Re-plan not found", 404);
  if (draft.state === "stale") throw new ActionError("A new reply arrived after this plan was made. Regenerate it first.");
  if (draft.state !== "open") throw new ActionError("This re-plan was already applied or discarded");
  const { data: c } = await db.from("campaigns").select("*").eq("id", draft.campaign_id).single();
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can apply a re-plan", 403);

  const saved = draft.claude_output as { output: import("@/lib/claude/schemas").CampaignOutput; validated: import("@/lib/claude/validate").ValidatedCampaign; model: string; payload: unknown };
  const take = contactIds?.length ? new Set(contactIds) : null;
  const tracks = saved.validated.tracks.filter((t) => !take || take.has(t.contactId));
  const version = (c.current_version ?? 1) + 1;

  // Supersede open steps for the contacts being re-planned; done steps are never touched.
  const replanned = tracks.map((t) => t.contactId);
  if (replanned.length) await db.from("steps").update({ status: "superseded" }).eq("campaign_id", c.id).in("contact_id", replanned).in("status", OPEN_STEP);

  for (const t of tracks) {
    const { data: existing } = await db.from("contact_tracks").select("id, current_step_no").eq("campaign_id", c.id).eq("contact_id", t.contactId).maybeSingle();
    if (existing) {
      const { data: last } = await db.from("steps").select("sequence_no").eq("track_id", existing.id).order("sequence_no", { ascending: false }).limit(1).maybeSingle();
      const base = last?.sequence_no ?? 0;
      await db.from("contact_tracks").update({
        persona: t.persona, track_goal: t.goal, rationale: t.rationale, assignee_id: t.assigneeId,
        start_trigger_type: t.trigger.type, trigger_from_contact_id: t.trigger.fromContactId, delay_working_days: t.trigger.delayWorkingDays,
        status: t.trigger.type === "fixed" ? "active" : "not_started", pause_reason: null, next_step_at: t.steps.find((s) => s.date)?.date ?? null,
      }).eq("id", existing.id);
      if (t.steps.length) {
        await db.from("steps").insert(t.steps.map((s, i) => ({
          campaign_id: c.id, track_id: existing.id, version_no: version, sequence_no: base + i + 1, contact_id: t.contactId, assignee_id: s.assigneeId,
          channel: s.channel, scheduled_date: s.date, original_date: s.originalDate, due_date: s.date, moved_from_date: s.movedNote ? s.originalDate : null, moved_reason: s.movedNote,
          offset_working_days: s.offsetWorkingDays, subject: s.subject, body: s.body, original_body: s.body, call_script: s.callScript, status: "upcoming",
        })));
      }
    } else {
      await insertTracks(db, c.id, version, { tracks: [t], blocking: [], notes: [], skipped: [] });
      await db.from("contact_tracks").update({ status: t.trigger.type === "fixed" ? "active" : "not_started" }).eq("campaign_id", c.id).eq("contact_id", t.contactId);
    }
  }

  await db.from("campaign_versions").insert({
    campaign_id: c.id, version_no: version, created_by: user.id, reason: draft.response_id ? "response" : "manual_edit", scope: draft.scope,
    change_summary: saved.output.change_summary, claude_input: saved.payload, claude_output: saved.output, model: saved.model,
  });
  await db.from("campaigns").update({ current_version: version, status: c.status === "meeting_booked" ? "meeting_booked" : "active" }).eq("id", c.id);
  await db.from("replan_drafts").update({ state: "applied" }).eq("id", draftId);
  await logActivity(db, { entityType: "campaign", entityId: c.id, action: "replan_applied", actorId: user.id, after: { version, contacts: replanned.length } });
  return { version };
}
