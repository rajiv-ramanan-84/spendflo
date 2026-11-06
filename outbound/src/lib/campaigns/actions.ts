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

export async function launchCampaign(db: SupabaseClient, user: SessionUser, campaignId: string) {
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
