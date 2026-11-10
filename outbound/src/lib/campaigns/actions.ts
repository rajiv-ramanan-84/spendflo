import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isIsoDate } from "@/lib/calendar/dates";
import { rollForward, reasonCopy } from "@/lib/calendar/working-calendar";
import { loadCalendarContext } from "@/lib/calendar/context";
import { todayIn } from "@/lib/calendar/dates";
import { logActivity } from "@/lib/activity/log";
import type { SessionUser } from "@/lib/auth/session";
import { canLaunch, openFlags, rebaseTrack, type ReviewFlag } from "./launch";
import { CHANNELS, type Channel } from "@/lib/claude/schemas";

/**
 * Campaign and step mutations. Each one checks who may do it, writes the
 * change, and logs before/after. Errors are thrown as ActionError with a
 * message the UI can show as-is.
 */

export class ActionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const OPEN = ["draft", "active", "paused", "responded", "meeting_booked"];

export function canEdit(user: SessionUser, ownerId: string | null) {
  return user.role === "admin" || user.role === "manager" || (!!user.id && user.id === ownerId);
}

async function campaignFor(db: SupabaseClient, campaignId: string) {
  const { data, error } = await db.from("campaigns").select("*").eq("id", campaignId).is("deleted_at", null).maybeSingle();
  if (error || !data) throw new ActionError("Campaign not found", 404);
  return data;
}

async function stepWithCampaign(db: SupabaseClient, stepId: string) {
  const { data: step } = await db.from("steps").select("*").eq("id", stepId).is("deleted_at", null).maybeSingle();
  if (!step) throw new ActionError("Step not found", 404);
  const campaign = await campaignFor(db, step.campaign_id);
  return { step, campaign };
}

export async function clearFlag(db: SupabaseClient, user: SessionUser, campaignId: string, flagId: string, how: "resolved" | "dismissed") {
  const c = await campaignFor(db, campaignId);
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can clear flags", 403);
  const flags = (c.review?.flags ?? []) as ReviewFlag[];
  if (!flags.some((f) => f.id === flagId)) throw new ActionError("Flag not found", 404);
  const cleared = Array.from(new Set([...(c.review_flags_cleared ?? []), flagId]));
  await db.from("campaigns").update({ review_flags_cleared: cleared }).eq("id", c.id);
  await logActivity(db, { entityType: "campaign", entityId: c.id, action: `flag_${how}`, actorId: user.id, after: { flagId } });
  return { open: openFlags(flags, cleared).length };
}

/** "I've read them all": clears every open flag in one action, logged with the count. */
export async function clearAllFlags(db: SupabaseClient, user: SessionUser, campaignId: string) {
  const c = await campaignFor(db, campaignId);
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can clear flags", 403);
  const flags = (c.review?.flags ?? []) as ReviewFlag[];
  const open = openFlags(flags, c.review_flags_cleared ?? []);
  await db.from("campaigns").update({ review_flags_cleared: flags.map((f) => f.id) }).eq("id", c.id);
  await logActivity(db, { entityType: "campaign", entityId: c.id, action: "flags_reviewed_all", actorId: user.id, after: { cleared: open.map((f) => f.id) } });
  return { open: 0 };
}

export type StepPatch = {
  subject?: string | null;
  body?: string | null;
  call_script?: string | null;
  channel?: string;
  assignee_id?: string;
  date?: string;
};

/** The step and its campaign, once the caller is allowed to edit it. */
export async function stepForEditing(db: SupabaseClient, user: SessionUser, stepId: string) {
  const { step, campaign } = await stepWithCampaign(db, stepId);
  if (!canEdit(user, campaign.owner_id) && step.assignee_id !== user.id) throw new ActionError("You can edit steps on your own accounts or assigned to you", 403);
  if (["done", "skipped", "superseded"].includes(step.status)) throw new ActionError("This step is closed and can't be edited");
  return { step, campaign };
}

export async function updateStep(db: SupabaseClient, user: SessionUser, stepId: string, patch: StepPatch) {
  const { step, campaign } = await stepWithCampaign(db, stepId);
  if (!canEdit(user, campaign.owner_id) && step.assignee_id !== user.id) throw new ActionError("You can edit steps on your own accounts or assigned to you", 403);
  if (["done", "skipped", "superseded"].includes(step.status)) throw new ActionError("This step is closed and can't be edited");

  const update: Record<string, unknown> = {};
  let movedNote: string | null = null;
  if (patch.subject !== undefined) update.subject = patch.subject;
  if (patch.body !== undefined) update.body = patch.body;
  if (patch.call_script !== undefined) update.call_script = patch.call_script;
  if (patch.channel !== undefined) {
    if (!CHANNELS.includes(patch.channel as Channel)) throw new ActionError("Unknown channel");
    update.channel = patch.channel;
  }
  if (patch.assignee_id !== undefined) {
    const { data: u } = await db.from("users").select("id, active").eq("id", patch.assignee_id).maybeSingle();
    if (!u?.active) throw new ActionError("Pick an active teammate");
    update.assignee_id = patch.assignee_id;
  }
  if (patch.date !== undefined) {
    if (!isIsoDate(patch.date)) throw new ActionError("Use a date like 2026-11-10");
    const today = todayIn();
    if (patch.date < today) throw new ActionError("Pick today or a later date");
    const { data: contact } = await db.from("contacts").select("country").eq("id", step.contact_id).maybeSingle();
    const ctx = await loadCalendarContext(db, [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
    const r = rollForward(patch.date, { country: contact?.country, assigneeId: (update.assignee_id as string) ?? step.assignee_id }, ctx);
    update.scheduled_date = r.date;
    update.due_date = r.date;
    update.moved_from_date = r.movedFrom;
    update.moved_reason = r.movedFrom ? `Moved from ${r.movedFrom} (${reasonCopy(r.reasons).join(", ")})` : null;
    movedNote = update.moved_reason as string | null;
  }
  if (!Object.keys(update).length) return { step, movedNote };

  const { data: after, error } = await db.from("steps").update(update).eq("id", stepId).select("*").single();
  if (error) throw new ActionError(error.message, 500);
  await logActivity(db, { entityType: "step", entityId: stepId, action: "edited", actorId: user.id, before: pick(step, Object.keys(update)), after: update });
  return { step: after, movedNote };
}

export async function addStep(db: SupabaseClient, user: SessionUser, trackId: string, s: { channel: string; date: string; subject?: string | null; body?: string | null; call_script?: string | null }) {
  const { data: track } = await db.from("contact_tracks").select("*").eq("id", trackId).maybeSingle();
  if (!track) throw new ActionError("Track not found", 404);
  const campaign = await campaignFor(db, track.campaign_id);
  if (!canEdit(user, campaign.owner_id)) throw new ActionError("Only the owner, admins or the manager can add steps", 403);
  if (!CHANNELS.includes(s.channel as Channel)) throw new ActionError("Unknown channel");

  const { data: last } = await db.from("steps").select("sequence_no, version_no").eq("track_id", trackId).order("sequence_no", { ascending: false }).limit(1).maybeSingle();
  const { data: created, error } = await db.from("steps").insert({
    campaign_id: campaign.id,
    track_id: trackId,
    version_no: campaign.current_version,
    sequence_no: (last?.sequence_no ?? 0) + 1,
    contact_id: track.contact_id,
    assignee_id: track.assignee_id,
    channel: s.channel,
    scheduled_date: s.date,
    original_date: s.date,
    due_date: s.date,
    subject: s.subject ?? null,
    body: s.body ?? null,
    original_body: s.body ?? null,
    call_script: s.call_script ?? null,
    status: "upcoming",
  }).select("id").single();
  if (error || !created) throw new ActionError(error?.message ?? "Could not add step", 500);
  await db.from("contact_tracks").update({ total_steps: (track.total_steps ?? 0) + 1 }).eq("id", trackId);
  // Run the date through the calendar the same way an edit does.
  await updateStep(db, user, created.id, { date: s.date });
  await logActivity(db, { entityType: "step", entityId: created.id, action: "added", actorId: user.id, after: s });
  return created.id as string;
}

export async function removeStep(db: SupabaseClient, user: SessionUser, stepId: string) {
  const { step, campaign } = await stepWithCampaign(db, stepId);
  if (!canEdit(user, campaign.owner_id)) throw new ActionError("Only the owner, admins or the manager can remove steps", 403);
  if (campaign.status === "draft") {
    await db.from("steps").update({ deleted_at: new Date().toISOString() }).eq("id", stepId);
  } else {
    if (["done", "skipped", "superseded"].includes(step.status)) throw new ActionError("This step is already closed");
    await db.from("steps").update({ status: "skipped", skip_reason: "Removed by owner" }).eq("id", stepId);
  }
  await logActivity(db, { entityType: "step", entityId: stepId, action: campaign.status === "draft" ? "deleted" : "skipped", actorId: user.id, before: step });
}

export async function launchCampaign(db: SupabaseClient, user: SessionUser, campaignId: string, opts: { acknowledgeFlags?: boolean } = {}) {
  const c = await campaignFor(db, campaignId);
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can launch", 403);
  if (c.status !== "draft") throw new ActionError("Only a draft can be launched");
  const { data: live } = await db.from("campaigns").select("id").eq("account_id", c.account_id).is("deleted_at", null).in("status", OPEN).neq("id", c.id);
  if (live?.length) throw new ActionError("This account already has a live campaign");

  const [{ data: tracks }, { data: steps }] = await Promise.all([
    db.from("contact_tracks").select("id, contact_id, assignee_id, start_trigger_type").eq("campaign_id", c.id),
    db.from("steps").select("id, track_id, due_date, assignee_id").eq("campaign_id", c.id).is("deleted_at", null),
  ]);
  const dated = (steps ?? []).filter((s) => s.due_date);
  const gate = canLaunch((c.review?.flags ?? []) as ReviewFlag[], c.review_flags_cleared ?? [], dated.length);
  if (!gate.ok) throw new ActionError(`Can't launch yet: ${gate.reason}`);
  if (gate.warnings.length && !opts.acknowledgeFlags) throw new ActionError(`${gate.reason}. Confirm to launch anyway.`, 409);
  if (gate.warnings.length) await logActivity(db, { entityType: "campaign", entityId: c.id, action: "launched_with_open_flags", actorId: user.id, after: { open: gate.warnings.map((f) => f.text) } });

  const today = todayIn();
  const ctx = await loadCalendarContext(db, [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
  const { data: contacts } = await db.from("contacts").select("id, country").in("id", (tracks ?? []).map((t) => t.contact_id));
  const countryOf = new Map((contacts ?? []).map((x) => [x.id, x.country]));

  let moved = 0;
  let startDate: string | null = null;
  for (const t of tracks ?? []) {
    const own = dated.filter((s) => s.track_id === t.id).map((s) => ({ id: s.id, date: s.due_date as string }));
    if (t.start_trigger_type === "fixed" && own.length) {
      const rebased = rebaseTrack(own, today, { country: countryOf.get(t.contact_id), assigneeId: t.assignee_id }, ctx);
      for (const r of rebased.filter((x) => x.movedFrom)) {
        moved++;
        await db.from("steps").update({ due_date: r.date, scheduled_date: r.date, moved_from_date: r.movedFrom, moved_reason: `Moved from ${r.movedFrom} (launched after that date)` }).eq("id", r.id);
      }
      const first = rebased[0]?.date ?? null;
      if (first && (!startDate || first < startDate)) startDate = first;
      await db.from("contact_tracks").update({ status: "active", start_date: first, next_step_at: first }).eq("id", t.id);
    }
  }
  await db.from("campaigns").update({ status: "active", start_date: startDate ?? c.start_date }).eq("id", c.id);
  // The urgent start deadline is met the moment a campaign launches.
  await db.from("accounts").update({ start_by: null }).eq("id", c.account_id);
  await logActivity(db, { entityType: "campaign", entityId: c.id, action: "launched", actorId: user.id, after: { moved, startDate } });
  return { moved, startDate };
}

export async function assignAccounts(db: SupabaseClient, user: SessionUser, accountIds: string[], ownerId: string) {
  if (user.role === "member") throw new ActionError("Only admins and the manager can assign accounts", 403);
  const { data: owner } = await db.from("users").select("id, active, name").eq("id", ownerId).maybeSingle();
  if (!owner?.active) throw new ActionError("Pick an active teammate");

  const { data: accounts } = await db.from("accounts").select("id, owner_id, name").in("id", accountIds);
  for (const a of accounts ?? []) {
    if (a.owner_id === ownerId) continue;
    await db.from("accounts").update({ owner_id: ownerId, sheet_owner_hint: null }).eq("id", a.id);
    const { data: camps } = await db.from("campaigns").select("id").eq("account_id", a.id).is("deleted_at", null).in("status", OPEN);
    const ids = (camps ?? []).map((x) => x.id);
    if (ids.length) {
      await db.from("campaigns").update({ owner_id: ownerId }).in("id", ids);
      if (a.owner_id) {
        // Open steps the old owner held move with the account.
        await db.from("steps").update({ assignee_id: ownerId }).in("campaign_id", ids).eq("assignee_id", a.owner_id).in("status", ["upcoming", "due", "overdue"]);
        await db.from("contact_tracks").update({ assignee_id: ownerId }).in("campaign_id", ids).eq("assignee_id", a.owner_id);
      }
    }
    await db.from("notifications").insert({ user_id: ownerId, type: "assignment", entity_type: "account", entity_id: a.id, message: `${a.name} is now yours` });
    await logActivity(db, { entityType: "account", entityId: a.id, action: "assigned", actorId: user.id, before: { owner_id: a.owner_id }, after: { owner_id: ownerId } });
  }
  return { assigned: (accounts ?? []).filter((a) => a.owner_id !== ownerId).length };
}

function pick(o: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, o[k]]));
}

/**
 * Pin a triggered track to fixed dates (or Start now for a stuck one): the
 * first open step lands on startDate (rolled to a working day), later steps
 * keep their spacing. The track no longer waits on anyone.
 */
export async function pinTrack(db: SupabaseClient, user: SessionUser, trackId: string, startDate: string) {
  if (!isIsoDate(startDate)) throw new ActionError("Pick a date");
  const { data: t } = await db.from("contact_tracks").select("id, campaign_id, contact_id, status, start_trigger_type, assignee_id").eq("id", trackId).maybeSingle();
  if (!t) throw new ActionError("Track not found", 404);
  const c = await campaignFor(db, t.campaign_id);
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can change dates", 403);
  if (t.start_trigger_type === "fixed" && t.status !== "nurture") throw new ActionError("This track already has fixed dates. Edit a step's date instead.");
  if (!["not_started", "paused", "nurture"].includes(t.status)) throw new ActionError("This track has already started");

  const today = todayIn();
  const ctx = await loadCalendarContext(db, [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
  const { data: contact } = await db.from("contacts").select("country").eq("id", t.contact_id).single();
  const scope = { country: contact?.country ?? null, assigneeId: t.assignee_id };
  const start = rollForward(startDate < today ? today : startDate, scope, ctx).date;
  const { data: steps } = await db.from("steps").select("id, offset_working_days, sequence_no").eq("track_id", t.id).in("status", ["upcoming", "due", "overdue"]).is("deleted_at", null).order("sequence_no");
  const { datesForTriggeredTrack } = await import("./triggers");
  const { scheduleTouches } = await import("@/lib/caps/schedule");
  const { loadPlanningContext, loadScheduledTouches } = await import("./context");
  const planned = datesForTriggeredTrack((steps ?? []).map((s) => ({ id: s.id, offset: s.offset_working_days ?? 0 })), start, 0, scope, ctx);
  // Same rules as everything else: account and person caps, one touch a day per person, working days.
  const p = await loadPlanningContext(db);
  const own = new Set((steps ?? []).map((s) => s.id));
  const existing = (await loadScheduledTouches(db, today)).filter((x) => !own.has(x.key));
  const { data: full } = await db.from("steps").select("id, channel").in("id", [...own]);
  const channelOf = new Map((full ?? []).map((s) => [s.id, s.channel as string]));
  const { scheduled } = scheduleTouches(
    planned.steps.map((x) => ({ key: x.id, date: x.date, contactId: t.contact_id, accountId: c.account_id, assigneeId: t.assignee_id ?? c.owner_id, channel: channelOf.get(x.id) ?? "email", country: contact?.country ?? null })),
    existing, p.caps, p.ctx,
  );
  for (const sch of scheduled) {
    await db.from("steps").update({
      due_date: sch.date, scheduled_date: sch.date, original_date: sch.movedFrom ?? sch.date,
      moved_from_date: sch.movedFrom ?? null, moved_reason: sch.movedFrom ? `Moved from ${sch.movedFrom} (account and team limits)` : null,
      status: sch.date < today ? "overdue" : sch.date === today ? "due" : "upcoming",
    }).eq("id", sch.key);
  }
  const firstDate = scheduled.map((x) => x.date).sort()[0] ?? planned.startDate;
  const live = c.status !== "draft";
  await db.from("contact_tracks").update({
    start_trigger_type: "fixed", start_date: firstDate, trigger_from_contact_id: null, trigger_step_index: null,
    status: live ? "active" : "not_started", next_step_at: firstDate, pause_reason: null,
  }).eq("id", t.id);
  await logActivity(db, { entityType: "track", entityId: t.id, action: "pinned_to_dates", actorId: user.id, after: { startDate: firstDate, moved: scheduled.filter((x) => x.movedFrom).length } });
  return { startDate: firstDate, moved: scheduled.filter((x) => x.movedFrom).length };
}

/** Pause every running track on the campaign, with a reason everyone can see. */
export async function pauseAllTracks(db: SupabaseClient, user: SessionUser, campaignId: string, reason: string, opts: { exceptContactId?: string | null } = {}) {
  const c = await campaignFor(db, campaignId);
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can pause tracks", 403);
  const why = reason.trim().slice(0, 120) || "Paused by the owner";
  // The person who said yes keeps their track: that is the one booking the meeting.
  let q = db.from("contact_tracks").update({ status: "paused", pause_reason: why }).eq("campaign_id", c.id).in("status", ["active", "not_started"]);
  if (opts.exceptContactId) q = q.neq("contact_id", opts.exceptContactId);
  const { data: paused } = await q.select("id");
  if (c.status === "active" && !opts.exceptContactId) await db.from("campaigns").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", c.id);
  await logActivity(db, { entityType: "campaign", entityId: c.id, action: "paused_all", actorId: user.id, after: { reason: why, tracks: paused?.length ?? 0 } });
  const { postAccountNote } = await import("@/lib/slack/posts");
  await postAccountNote(db, c.account_id, `paused-${c.id}-${new Date().toISOString().slice(0, 16)}`, `${paused?.length ?? 0} track${paused?.length === 1 ? "" : "s"} paused: ${why}.`);
  return { paused: paused?.length ?? 0 };
}

/** Resume paused tracks. Steps whose dates passed while paused move to the next working days. */
export async function resumeTracks(db: SupabaseClient, user: SessionUser, campaignId: string) {
  const c = await campaignFor(db, campaignId);
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can resume tracks", 403);
  const today = todayIn();
  const ctx = await loadCalendarContext(db, [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
  const { data: tracks } = await db.from("contact_tracks").select("id, contact_id, start_trigger_type, assignee_id").eq("campaign_id", c.id).eq("status", "paused");
  for (const t of tracks ?? []) {
    const { data: steps } = await db.from("steps").select("id, due_date").eq("track_id", t.id).in("status", ["upcoming", "due", "overdue"]).not("due_date", "is", null).is("deleted_at", null);
    const { data: contact } = await db.from("contacts").select("country").eq("id", t.contact_id).single();
    const moved = rebaseTrack((steps ?? []).map((s) => ({ id: s.id, date: s.due_date! })), today, { country: contact?.country ?? null, assigneeId: t.assignee_id }, ctx);
    for (const m of moved.filter((x) => x.movedFrom)) {
      await db.from("steps").update({ due_date: m.date, scheduled_date: m.date, moved_from_date: m.movedFrom, moved_reason: `Moved from ${m.movedFrom} (track was paused)`, status: m.date === today ? "due" : "upcoming" }).eq("id", m.id);
    }
    const hasDates = (steps ?? []).length > 0;
    await db.from("contact_tracks").update({ status: t.start_trigger_type === "fixed" || hasDates ? "active" : "not_started", pause_reason: null }).eq("id", t.id);
  }
  if (c.status === "paused") await db.from("campaigns").update({ status: "active", paused_at: null }).eq("id", c.id);
  await logActivity(db, { entityType: "campaign", entityId: c.id, action: "resumed", actorId: user.id, after: { tracks: tracks?.length ?? 0 } });
  return { resumed: tracks?.length ?? 0 };
}

/** The win: campaign at Meeting booked, and the person who said yes at Meeting. */
export async function markMeetingBooked(db: SupabaseClient, user: SessionUser, campaignId: string, contactId: string | null) {
  const c = await campaignFor(db, campaignId);
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can mark a meeting", 403);
  await db.from("campaigns").update({ status: "meeting_booked" }).eq("id", c.id);
  if (contactId) {
    await db.from("contacts").update({ engagement_status: "meeting" }).eq("id", contactId);
    await db.from("contact_tracks").update({ status: "meeting" }).eq("campaign_id", c.id).eq("contact_id", contactId);
  }
  await logActivity(db, { entityType: "campaign", entityId: c.id, action: "meeting_booked", actorId: user.id, after: { contactId } });
  const { postAccountNote } = await import("@/lib/slack/posts");
  await postAccountNote(db, c.account_id, `meeting-${c.id}`, ":tada: Meeting booked.");
  return {};
}

/**
 * Nurture: hold a person back without losing their plan. Open steps keep their
 * spacing (as working-day offsets) but lose their dates, so they stop counting
 * toward caps and drop off Tasks until someone makes them active again.
 */
export async function moveToNurture(db: SupabaseClient, user: SessionUser, trackId: string, reason: string) {
  const { data: t } = await db.from("contact_tracks").select("id, campaign_id, contact_id, status, assignee_id").eq("id", trackId).maybeSingle();
  if (!t) throw new ActionError("Track not found", 404);
  const c = await campaignFor(db, t.campaign_id);
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can change who is active", 403);
  if (!["not_started", "active", "paused"].includes(t.status)) throw new ActionError(t.status === "nurture" ? "Already in nurture" : "This person's track has ended");
  const today = todayIn();
  const ctx = await loadCalendarContext(db, [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
  const { data: contact } = await db.from("contacts").select("country").eq("id", t.contact_id).single();
  const scope = { country: contact?.country ?? null, assigneeId: t.assignee_id };
  const { data: steps } = await db.from("steps").select("id, due_date, offset_working_days, sequence_no").eq("track_id", t.id).in("status", ["upcoming", "due", "overdue"]).is("deleted_at", null).order("sequence_no");
  const { workingDaysBetween } = await import("@/lib/calendar/working-calendar");
  const start = (steps ?? []).map((x) => x.due_date).filter(Boolean).sort()[0] as string | undefined;
  for (const x of steps ?? []) {
    const offset = x.due_date && start ? workingDaysBetween(start, x.due_date, scope, ctx) : (x.offset_working_days ?? 0);
    await db.from("steps").update({ due_date: null, offset_working_days: offset, status: "upcoming", gmail_draft_id: null }).eq("id", x.id);
  }
  const why = reason.trim().slice(0, 160) || "Held back by the owner";
  await db.from("contact_tracks").update({ status: "nurture", pause_reason: why, next_step_at: null }).eq("id", t.id);
  await logActivity(db, { entityType: "track", entityId: t.id, action: "moved_to_nurture", actorId: user.id, before: { status: t.status }, after: { status: "nurture", reason: why, parkedSteps: steps?.length ?? 0 } });
  const { data: waiting } = await db.from("contact_tracks").select("id").eq("campaign_id", t.campaign_id).eq("trigger_from_contact_id", t.contact_id).eq("status", "not_started");
  return { parked: steps?.length ?? 0, waitingOnThem: waiting?.length ?? 0 };
}

/** Make a nurture person active: their saved steps get real dates from the start date, under the same caps. */
export async function activateTrack(db: SupabaseClient, user: SessionUser, trackId: string, reason: string, startDate?: string) {
  const { data: t } = await db.from("contact_tracks").select("id, status").eq("id", trackId).maybeSingle();
  if (!t) throw new ActionError("Track not found", 404);
  if (t.status !== "nurture") throw new ActionError("This person is already active");
  const { count } = await db.from("steps").select("id", { count: "exact", head: true }).eq("track_id", trackId).in("status", ["upcoming", "due", "overdue"]).is("deleted_at", null);
  if (!count) throw new ActionError("This person has no steps yet. Add a step first.");
  const r = await pinTrack(db, user, trackId, startDate && isIsoDate(startDate) ? startDate : todayIn());
  await logActivity(db, { entityType: "track", entityId: trackId, action: "made_active", actorId: user.id, after: { reason: reason.trim().slice(0, 160) || null, startDate: r.startDate } });
  return r;
}

/** Bring someone with no track into the campaign: an empty track the owner fills with steps. */
export async function addPersonToCampaign(db: SupabaseClient, user: SessionUser, campaignId: string, contactId: string, reason: string) {
  const c = await campaignFor(db, campaignId);
  if (!canEdit(user, c.owner_id)) throw new ActionError("Only the owner, admins or the manager can change who is active", 403);
  const { data: contact } = await db.from("contacts").select("id, account_id, persona, exclude, do_not_contact").eq("id", contactId).maybeSingle();
  if (!contact || contact.account_id !== c.account_id) throw new ActionError("That person is not on this account", 404);
  if (contact.exclude || contact.do_not_contact) throw new ActionError("This person is excluded or marked do not contact");
  const { data: existing } = await db.from("contact_tracks").select("id").eq("campaign_id", c.id).eq("contact_id", contactId).maybeSingle();
  if (existing) throw new ActionError("This person already has a track in this campaign");
  const today = todayIn();
  const { data: track, error } = await db.from("contact_tracks").insert({
    campaign_id: c.id, contact_id: contactId, persona: contact.persona, start_trigger_type: "fixed", start_date: today,
    assignee_id: c.owner_id, status: c.status === "draft" ? "not_started" : "active", rationale: reason.trim().slice(0, 300) || null,
  }).select("id").single();
  if (error || !track) throw new ActionError("Could not add them. Please try again.");
  await logActivity(db, { entityType: "track", entityId: track.id, action: "made_active", actorId: user.id, after: { reason: reason.trim().slice(0, 160) || null, added: true } });
  return { trackId: track.id };
}
