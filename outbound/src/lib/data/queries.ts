import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read models for the screens. These run on the signed-in user's session, so
 * row-level security applies: an inactive or unknown user sees nothing.
 */

export type UserLite = { id: string; name: string; email: string; role: string; active: boolean; sendsAs?: { name: string; email: string } };

export type AccountRow = {
  id: string;
  sheet_account_id: string;
  name: string;
  domain: string | null;
  tier: string | null;
  icp_verdict: string | null;
  owner_id: string | null;
  archived: boolean;
  priority_score: number;
  priority_reasons: string[];
  sheet_owner_hint: string | null;
  campaign_status: string | null;
  next_step_date: string | null;
  last_touch: string | null;
  contacts_engaged: number;
  contacts_total: number;
  play: string | null;
  play_level: string | null;
  play_points_to: string | null;
  play_signal_count: number;
  last_signal_on: string | null;
};

async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export async function listUsers(db: SupabaseClient): Promise<UserLite[]> {
  const [users, { data: mailboxes }] = await Promise.all([
    q<Array<UserLite & { send_mailbox_id: string | null }>>(db.from("users").select("id, name, email, role, active, send_mailbox_id").order("name")),
    db.from("mailboxes").select("id, email, writes_as_user_id"),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const mb = new Map((mailboxes ?? []).map((m) => [m.id as string, m]));
  // Who each person's emails are from: a shared mailbox in someone else's name, or themselves.
  return users.map(({ send_mailbox_id, ...u }) => {
    const m = send_mailbox_id ? mb.get(send_mailbox_id) : null;
    return { ...u, sendsAs: m ? { name: nameOf.get(m.writes_as_user_id as string) ?? u.name, email: m.email as string } : { name: u.name, email: u.email } };
  });
}

export async function listAccounts(db: SupabaseClient, opts: { includeArchived?: boolean } = {}): Promise<AccountRow[]> {
  let a = db.from("accounts").select("id, sheet_account_id, name, domain, tier, icp_verdict, owner_id, archived, priority_score, priority_reasons, sheet_owner_hint, play, play_level, play_points_to, play_signal_count, last_signal_on").is("deleted_at", null);
  if (!opts.includeArchived) a = a.eq("archived", false);
  const [accounts, rollup] = await Promise.all([
    q<Omit<AccountRow, "campaign_status" | "next_step_date" | "last_touch" | "contacts_engaged" | "contacts_total">[]>(a.order("tier").order("name")),
    q<Array<{ account_id: string; campaign_status: string | null; next_step_date: string | null; last_touch: string | null; contacts_engaged: number; contacts_total: number }>>(
      db.from("account_rollup").select("account_id, campaign_status, next_step_date, last_touch, contacts_engaged, contacts_total"),
    ),
  ]);
  const r = new Map(rollup.map((x) => [x.account_id, x]));
  return accounts.map((x) => {
    const y = r.get(x.id);
    return {
      ...x,
      priority_reasons: (x.priority_reasons as unknown as string[]) ?? [],
      campaign_status: y?.campaign_status ?? null,
      next_step_date: y?.next_step_date ?? null,
      last_touch: y?.last_touch ?? null,
      contacts_engaged: y?.contacts_engaged ?? 0,
      contacts_total: y?.contacts_total ?? 0,
    };
  });
}

export type CockpitStep = {
  id: string;
  track_id: string;
  sequence_no: number;
  channel: string;
  status: string;
  due_date: string | null;
  original_date: string | null;
  moved_reason: string | null;
  offset_working_days: number | null;
  subject: string | null;
  body: string | null;
  original_body: string | null;
  call_script: string | null;
  assignee_id: string | null;
  completed_at: string | null;
  outcome_note: string | null;
};

export type CockpitTrack = {
  id: string;
  contact_id: string;
  persona: string | null;
  track_goal: string | null;
  rationale: string | null;
  status: string;
  start_trigger_type: string;
  trigger_from_contact_id: string | null;
  trigger_step_index: number | null;
  pause_reason?: string | null;
  delay_working_days: number | null;
  start_date: string | null;
  assignee_id: string | null;
  steps: CockpitStep[];
};

export async function getCockpit(db: SupabaseClient, accountId: string) {
  const account = await q<Record<string, unknown> & { id: string; name: string; owner_id: string | null }>(
    db.from("accounts").select("*").eq("id", accountId).is("deleted_at", null).single(),
  );
  const [contacts, campaigns, users] = await Promise.all([
    q<Array<{ id: string; sheet_contact_key: string; full_name: string; title: string | null; persona: string | null; email: string | null; linkedin_url: string | null; engagement_status: string; exclude: boolean; do_not_contact: boolean; bounced: boolean; changed_flag: boolean; sheet_deleted_at: string | null }>>(
      db.from("contacts").select("id, sheet_contact_key, full_name, title, persona, email, linkedin_url, engagement_status, exclude, do_not_contact, bounced, changed_flag, sheet_deleted_at").eq("account_id", accountId).is("deleted_at", null).order("full_name"),
    ),
    q<Array<Record<string, unknown> & { id: string; status: string; current_version: number; created_at: string }>>(
      db.from("campaigns").select("*").eq("account_id", accountId).is("deleted_at", null).order("created_at", { ascending: false }),
    ),
    listUsers(db),
  ]);
  const open = campaigns.find((c) => ["draft", "active", "paused", "responded", "meeting_booked"].includes(c.status)) ?? campaigns[0] ?? null;

  let tracks: CockpitTrack[] = [];
  if (open) {
    const [t, s] = await Promise.all([
      q<Omit<CockpitTrack, "steps">[]>(db.from("contact_tracks").select("id, contact_id, persona, track_goal, rationale, status, pause_reason, start_trigger_type, trigger_from_contact_id, trigger_step_index, delay_working_days, start_date, assignee_id").eq("campaign_id", open.id)),
      q<CockpitStep[]>(
        db.from("steps").select("id, track_id, sequence_no, channel, status, due_date, original_date, moved_reason, offset_working_days, subject, body, original_body, call_script, assignee_id, completed_at, outcome_note")
          .eq("campaign_id", open.id).is("deleted_at", null).neq("status", "superseded").order("sequence_no"),
      ),
    ]);
    tracks = t.map((tr) => ({ ...tr, steps: s.filter((x) => x.track_id === tr.id) }));
  }
  return { account, contacts, campaign: open, tracks, users };
}

export type CockpitResponse = {
  id: string; state: string; source: string; channel: string; classification: string | null; confidence: number | null; needs_review: boolean;
  summary: string | null; raw_text: string | null; received_at: string; contact_id: string | null; from_address: string | null;
  return_date: string | null; referred_to: string | null; suggested_next_step: string | null; owner_next_step: string | null; campaign_id: string | null;
};
export type CockpitReplan = { id: string; state: string; scope: string; response_id: string | null; created_at: string; claude_output: { output?: { change_summary?: string | null }; diff?: import("@/lib/responses/diff").DiffRow[]; validated?: { blocking?: Array<{ text: string }>; notes?: Array<{ text: string }> } } | null };

/** Responses on an account that still need a person, and the latest re-plan. */
export async function getAccountResponses(db: SupabaseClient, accountId: string, campaignId: string | null) {
  const { data: rows } = await db.from("responses")
    .select("id, state, source, channel, classification, confidence, needs_review, summary, raw_text, received_at, contact_id, from_address, return_date, referred_to, suggested_next_step, owner_next_step, campaign_id")
    .eq("account_id", accountId).neq("state", "dismissed").order("received_at", { ascending: false }).limit(20);
  const { data: draft } = campaignId
    ? await db.from("replan_drafts").select("id, state, scope, response_id, created_at, claude_output").eq("campaign_id", campaignId).in("state", ["open", "stale"]).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  return { responses: (rows ?? []) as CockpitResponse[], replan: (draft ?? null) as CockpitReplan | null };
}
