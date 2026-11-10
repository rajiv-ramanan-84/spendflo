import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type Refs = { ref: (id: string | null | undefined) => string | null };

/**
 * Everything that has already happened on a campaign, in the form Claude reads before it re-plans:
 * each step done or skipped with its outcome, every reply, who accepted on LinkedIn, which tracks are paused
 * and why, and the earlier versions of the plan. A re-plan must build on this and never repeat or ignore it.
 */
export async function loadReplanHistory(db: SupabaseClient, campaignId: string, accountId: string, refs: Refs) {
  const [{ data: steps }, { data: replies }, { data: tracks }, { data: versions }] = await Promise.all([
    db.from("steps").select("contact_id, sequence_no, channel, status, due_date, completed_at, subject, sent_body, body, outcome_note, call_outcome, skip_reason, linkedin_accepted_at, moved_reason, original_date").eq("campaign_id", campaignId).is("deleted_at", null).order("completed_at", { ascending: true, nullsFirst: false }).limit(300),
    db.from("responses").select("contact_id, channel, classification, summary, received_at, state, owner_next_step, campaign_id").eq("account_id", accountId).order("received_at", { ascending: true }).limit(60),
    db.from("contact_tracks").select("contact_id, status, pause_reason, start_trigger_type").eq("campaign_id", campaignId),
    db.from("campaign_versions").select("version_no, reason, scope, created_at").eq("campaign_id", campaignId).order("version_no", { ascending: true }).limit(20),
  ]);
  const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
  return {
    steps_taken: (steps ?? []).filter((s) => ["done", "skipped"].includes(s.status as string)).map((s) => ({
      contact_ref: refs.ref(s.contact_id as string), step: s.sequence_no, channel: s.channel, result: s.status, on: day(s.completed_at as string | null) ?? s.due_date,
      subject: s.subject ?? undefined, text_sent: ((s.sent_body as string | null) ?? (s.body as string | null))?.slice(0, 1200) ?? undefined,
      outcome_note: s.outcome_note ?? undefined, call_outcome: s.call_outcome ?? undefined, skip_reason: s.skip_reason ?? undefined,
      linkedin_accepted_on: day(s.linkedin_accepted_at as string | null) ?? undefined,
    })),
    open_steps_moved: (steps ?? []).filter((s) => !["done", "skipped", "superseded"].includes(s.status as string) && s.moved_reason).map((s) => ({ contact_ref: refs.ref(s.contact_id as string), step: s.sequence_no, channel: s.channel, now: s.due_date, was: s.original_date, why: s.moved_reason })),
    replies_and_responses: (replies ?? []).map((r) => ({
      contact_ref: refs.ref(r.contact_id as string | null), channel: r.channel, kind: r.classification ?? "unsorted", summary: r.summary ?? undefined,
      on: day(r.received_at as string), handled: r.state === "confirmed" || r.state === "applied" ? true : undefined, owner_said: r.owner_next_step ?? undefined,
    })),
    tracks_now: (tracks ?? []).map((t) => ({ contact_ref: refs.ref(t.contact_id as string), status: t.status, why_paused: t.pause_reason ?? undefined })),
    plan_versions: (versions ?? []).map((v) => ({ version: v.version_no, reason: v.reason, scope: v.scope, on: day(v.created_at as string) })),
  };
}
