import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, type IsoDate } from "@/lib/calendar/dates";
import { addWorkingDays, type CalendarContext } from "@/lib/calendar/working-calendar";
import { focusOrder, isFocusWorthy } from "@/lib/priority/score";
import { needsEdit } from "@/lib/tasks/state";
import { projectTriggeredTracks, type PTrack } from "@/lib/campaigns/projection";

/** Everything the Today screen shows, for one person or the whole team. */

/** Ready to send, needs a fix first, or waiting on a reply or an earlier step. */
export type TaskState = "ready" | "edit" | "waiting";

export type TodayStep = {
  id: string;
  /** Null only for a waiting step with no date yet (it starts when someone replies). */
  due_date: string | null;
  bucket: "overdue" | "today" | "tomorrow" | "week" | "later" | "waiting";
  state: TaskState;
  state_reason: string | null;
  status: string;
  channel: string;
  subject: string | null;
  body: string | null;
  call_script: string | null;
  moved_reason: string | null;
  gmail_draft_id: string | null;
  gmail_message_id: string | null;
  sequence_no: number;
  assignee_id: string | null;
  track_id: string;
  campaign_id: string;
  account: { id: string; name: string; tier: string | null };
  contact: { id: string; full_name: string; title: string | null; persona: string | null; email: string | null; linkedin_url: string | null; phone: string | null; country: string | null; bounced?: boolean | null; do_not_contact?: boolean | null };
  original_body: string | null;
  original_date: string | null;
  offset_working_days: number | null;
  completed_at: string | null;
  outcome_note: string | null;
};

export type ReplyCard = {
  id: string;
  state: string;
  classification: string | null;
  confidence: number | null;
  needs_review: boolean;
  summary: string | null;
  received_at: string;
  channel: string;
  account: { id: string; name: string; tier: string | null } | null;
  contact: { id: string; full_name: string; title: string | null } | null;
  from_address: string | null;
  suggested_next_step: string | null;
};

/** A super hot or hot account whose first activity is due: shown first on Tasks. */
export type UrgentCard = { id: string; name: string; tier: string | null; level: "super_hot" | "hot"; play: string | null; startBy: string; signals: number };

export type FocusCard = { id: string; name: string; tier: string | null; score: number; reasons: string[]; pinned: boolean; nextAction: string | null; nextStepId: string | null; campaignStatus: string | null };

const TIER_RANK: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
const LIVE = ["active", "responded", "meeting_booked"];
const STEP_COLS = "id, due_date, status, channel, subject, body, call_script, moved_reason, gmail_draft_id, gmail_message_id, sequence_no, assignee_id, track_id, campaign_id, contact_id, original_body, original_date, offset_working_days, completed_at, outcome_note";
const CONTACT_COLS = "id, full_name, title, persona, email, linkedin_url, phone, country, bounced, do_not_contact";



/** Replies waiting: detected and not yet confirmed, or confirmed and not yet re-planned. */
async function loadReplies(db: SupabaseClient, opts: { userId: string | null; scope: "mine" | "team" }): Promise<ReplyCard[]> {
  let accountScope: string[] | null = null;
  if (opts.scope === "mine" && opts.userId) {
    const { data: mine } = await db.from("accounts").select("id").eq("owner_id", opts.userId);
    accountScope = (mine ?? []).map((a) => a.id);
  }
  let respQ = db.from("responses").select("id, state, classification, confidence, needs_review, summary, received_at, channel, account_id, contact_id, campaign_id, from_address, suggested_next_step").in("state", ["pending", "confirmed"]).order("received_at", { ascending: false }).limit(50);
  if (accountScope) respQ = respQ.in("account_id", accountScope.length ? accountScope : ["00000000-0000-0000-0000-000000000000"]);
  const { data: resp } = await respQ;
  const respCamps = [...new Set((resp ?? []).map((r) => r.campaign_id).filter(Boolean))] as string[];
  const { data: respCampRows } = respCamps.length ? await db.from("campaigns").select("id, status").in("id", respCamps) : { data: [] as Array<{ id: string; status: string }> };
  const replanned = new Set((respCampRows ?? []).filter((c) => c.status !== "responded").map((c) => c.id));
  const respAccounts = [...new Set((resp ?? []).map((r) => r.account_id).filter(Boolean))] as string[];
  const respContacts = [...new Set((resp ?? []).map((r) => r.contact_id).filter(Boolean))] as string[];
  const [{ data: ra }, { data: rc }] = await Promise.all([
    respAccounts.length ? db.from("accounts").select("id, name, tier").in("id", respAccounts) : Promise.resolve({ data: [] as Array<{ id: string; name: string; tier: string | null }> }),
    respContacts.length ? db.from("contacts").select("id, full_name, title").in("id", respContacts) : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; title: string | null }> }),
  ]);
  const replies: ReplyCard[] = (resp ?? [])
    .filter((r) => r.state === "pending" || (r.campaign_id && !replanned.has(r.campaign_id)))
    .map((r) => ({
      ...r,
      account: (ra ?? []).find((a) => a.id === r.account_id) ?? null,
      contact: (rc ?? []).find((c) => c.id === r.contact_id) ?? null,
    }));

  return replies;
}

export async function loadToday(db: SupabaseClient, opts: { userId: string | null; scope: "mine" | "team"; today: IsoDate; ctx: CalendarContext }) {
  const { today, ctx } = opts;
  const tomorrow = addWorkingDays(today, 1, {}, ctx);
  const weekEnd = addDays(today, 7);
  const horizon = addDays(today, 60);

  // Everything below that does not depend on the steps starts now, so the page waits for the slowest chain, not the sum of all of them.
  const repliesP = loadReplies(db, opts);
  const waitingP = waitingSteps(db, { userId: opts.userId, scope: opts.scope, today, tomorrow, weekEnd, horizon, ctx });
  let focusQ = db.from("accounts").select("id, name, tier, priority_score, priority_reasons").eq("archived", false).is("deleted_at", null);
  if (opts.scope === "mine" && opts.userId) focusQ = focusQ.eq("owner_id", opts.userId);
  const focusDataP = Promise.all([
    focusQ.order("priority_score", { ascending: false }).limit(200),
    opts.userId ? db.from("account_pins").select("account_id").eq("user_id", opts.userId) : Promise.resolve({ data: [] as Array<{ account_id: string }> }),
    db.from("account_rollup").select("account_id, campaign_status"),
  ]);
  let urgentQ = db.from("accounts").select("id, name, tier, play, play_points_to, play_level, start_by, play_signal_count").eq("archived", false).is("deleted_at", null).not("start_by", "is", null).in("play_level", ["super_hot", "hot"]).order("start_by").limit(30);
  if (opts.scope === "mine" && opts.userId) urgentQ = urgentQ.eq("owner_id", opts.userId);
  const urgentP = urgentQ;
  let doneQ = db.from("steps").select("id", { count: "exact", head: true }).eq("status", "done").gte("completed_at", `${today}T00:00:00`);
  if (opts.scope === "mine" && opts.userId) doneQ = doneQ.eq("completed_by", opts.userId);
  const doneP = doneQ;

  let stepsQ = db.from("steps")
    .select(STEP_COLS)
    .in("status", ["upcoming", "due", "overdue"]).is("deleted_at", null).not("due_date", "is", null).lte("due_date", horizon);
  if (opts.scope === "mine" && opts.userId) stepsQ = stepsQ.eq("assignee_id", opts.userId);
  const { data: rawSteps } = await stepsQ;

  // Only steps of live campaigns and active tracks belong on Today.
  const campIds = [...new Set((rawSteps ?? []).map((s) => s.campaign_id))];
  const trackIds = [...new Set((rawSteps ?? []).map((s) => s.track_id))];
  const contactIds = [...new Set((rawSteps ?? []).map((s) => s.contact_id))];
  const [{ data: camps }, { data: tracks }, { data: contacts }] = await Promise.all([
    campIds.length ? db.from("campaigns").select("id, account_id, status").in("id", campIds) : Promise.resolve({ data: [] as Array<{ id: string; account_id: string; status: string }> }),
    trackIds.length ? db.from("contact_tracks").select("id, status, persona").in("id", trackIds) : Promise.resolve({ data: [] as Array<{ id: string; status: string; persona: string | null }> }),
    contactIds.length ? db.from("contacts").select(CONTACT_COLS).in("id", contactIds) : Promise.resolve({ data: [] as TodayStep["contact"][] }),
  ]);
  const accountIds = [...new Set((camps ?? []).map((c) => c.account_id))];
  const { data: accounts } = accountIds.length
    ? await db.from("accounts").select("id, name, tier").in("id", accountIds)
    : { data: [] as Array<{ id: string; name: string; tier: string | null }> };

  const campMap = new Map((camps ?? []).map((c) => [c.id, c]));
  const trackMap = new Map((tracks ?? []).map((t) => [t.id, t]));
  const contactMap = new Map((contacts ?? []).map((c) => [c.id, c]));
  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));

  const steps: TodayStep[] = (rawSteps ?? [])
    .filter((s) => {
      const c = campMap.get(s.campaign_id);
      const t = trackMap.get(s.track_id);
      return c && LIVE.includes(c.status) && t && t.status === "active";
    })
    .map((s) => {
      const c = campMap.get(s.campaign_id)!;
      const contact = contactMap.get(s.contact_id)!;
      const account = accountMap.get(c.account_id)!;
      const edit = needsEdit(s, contact, account.name);
      return {
        ...s,
        bucket: s.due_date! < today ? "overdue" : s.due_date === today ? "today" : s.due_date === tomorrow ? "tomorrow" : s.due_date! <= weekEnd ? "week" : "later",
        state: edit ? "edit" : "ready",
        state_reason: edit,
        account,
        contact: { ...contact, persona: trackMap.get(s.track_id)?.persona ?? contact.persona },
      } as TodayStep;
    });

  steps.push(...(await waitingP));
  steps.sort((a, b) => (TIER_RANK[a.account.tier ?? ""] ?? 9) - (TIER_RANK[b.account.tier ?? ""] ?? 9) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.account.name.localeCompare(b.account.name));

  // Focus Today: my accounts (or everyone's), ranked.
  const replies = await repliesP;
  const [{ data: focusAccounts }, { data: pins }, { data: rollup }] = await focusDataP;
  const pinned = new Set((pins ?? []).map((p) => p.account_id));
  const statusOf = new Map((rollup ?? []).map((r) => [r.account_id, r.campaign_status as string | null]));
  const firstStep = new Map<string, TodayStep>();
  for (const s of steps) if (!firstStep.has(s.account.id)) firstStep.set(s.account.id, s);
  const focus: FocusCard[] = focusOrder(
    (focusAccounts ?? []).filter((a) => isFocusWorthy((a.priority_reasons as string[]) ?? [], pinned.has(a.id))).map((a) => ({
      id: a.id, name: a.name, tier: a.tier, score: a.priority_score ?? 0, reasons: (a.priority_reasons as string[]) ?? [], pinned: pinned.has(a.id),
      campaignStatus: statusOf.get(a.id) ?? null,
      nextStepId: firstStep.get(a.id)?.id ?? null,
      nextAction: replies.some((r) => r.account?.id === a.id) ? "Re-plan" : firstStep.get(a.id) ? "Open next step" : statusOf.get(a.id) === "draft" ? "Review draft" : !statusOf.get(a.id) ? "Generate" : "Open",
    })),
    10,
  );

  // Accounts that must start now: super hot within 24 hours, hot within 48. Cleared the moment a campaign launches.
  const { data: urgentRows } = await urgentP;
  const urgent: UrgentCard[] = (urgentRows ?? []).map((a) => ({ id: a.id, name: a.name, tier: a.tier, level: a.play_level as "super_hot" | "hot", play: (a.play ?? a.play_points_to) as string | null, startBy: a.start_by as string, signals: a.play_signal_count ?? 0 }));

  // Header strip
  const { count: doneToday } = await doneP;

  return {
    steps,
    replies,
    urgent,
    focus,
    header: {
      dueToday: steps.filter((s) => s.bucket === "today" && s.state !== "waiting").length,
      doneToday: doneToday ?? 0,
      overdue: steps.filter((s) => s.bucket === "overdue").length,
      replies: replies.length,
    },
    tomorrow,
  };
}

/**
 * Tracks that start on a trigger ("after Sean replies", "2 days after Michele's
 * step 2"): their first open step, shown as Waiting with the projected date, so
 * the next 7 days shows what is coming and why it can't be pulled forward.
 */
async function waitingSteps(db: SupabaseClient, o: { userId: string | null; scope: "mine" | "team"; today: IsoDate; tomorrow: IsoDate; weekEnd: IsoDate; horizon: IsoDate; ctx: CalendarContext }): Promise<TodayStep[]> {
  let wq = db.from("contact_tracks").select("campaign_id").eq("status", "not_started").neq("start_trigger_type", "fixed");
  if (o.scope === "mine" && o.userId) wq = wq.eq("assignee_id", o.userId);
  const { data: waiting } = await wq;
  const campIds = [...new Set((waiting ?? []).map((w) => w.campaign_id))];
  if (!campIds.length) return [];
  const { data: camps } = await db.from("campaigns").select("id, account_id, status").in("id", campIds).in("status", LIVE).is("deleted_at", null);
  const live = (camps ?? []).map((c) => c.id);
  if (!live.length) return [];
  const [{ data: tracks }, { data: steps }] = await Promise.all([
    db.from("contact_tracks").select("id, campaign_id, contact_id, status, persona, assignee_id, start_trigger_type, trigger_from_contact_id, trigger_step_index, delay_working_days").in("campaign_id", live),
    db.from("steps").select(STEP_COLS).in("campaign_id", live).is("deleted_at", null).neq("status", "superseded"),
  ]);
  const contactIds = [...new Set((tracks ?? []).map((t) => t.contact_id))];
  const accountIds = [...new Set((camps ?? []).map((c) => c.account_id))];
  const [{ data: contacts }, { data: accounts }] = await Promise.all([
    db.from("contacts").select(CONTACT_COLS).in("id", contactIds),
    db.from("accounts").select("id, name, tier").in("id", accountIds),
  ]);
  const contactOf = new Map((contacts ?? []).map((c) => [c.id, c]));
  const accountOf = new Map((accounts ?? []).map((a) => [a.id, a]));
  const out: TodayStep[] = [];
  for (const c of camps ?? []) {
    const ct = (tracks ?? []).filter((t) => t.campaign_id === c.id);
    const pt: PTrack[] = ct.map((t) => ({ ...t, steps: (steps ?? []).filter((s) => s.track_id === t.id) }));
    const names = new Map(ct.map((t) => [t.contact_id, contactOf.get(t.contact_id)?.full_name ?? "the other contact"]));
    for (const p of projectTriggeredTracks(pt, names, o.ctx)) {
      const t = ct.find((x) => x.id === p.trackId)!;
      if (o.scope === "mine" && o.userId && t.assignee_id !== o.userId) continue;
      const first = (steps ?? []).filter((s) => s.track_id === t.id && ["upcoming", "due", "overdue"].includes(s.status)).sort((a, b) => a.sequence_no - b.sequence_no)[0];
      const contact = contactOf.get(t.contact_id);
      if (!first || !contact) continue;
      const date = p.kind === "projected" ? p.dates[first.id] ?? null : null;
      if (date && date > o.horizon) continue;
      const basis = p.kind === "stuck" ? `Stuck: ${p.reason}` : `Waits: ${p.basis.replace(/^starts /, "")}`;
      out.push({
        ...first,
        due_date: date,
        bucket: !date ? "waiting" : date <= o.today ? "today" : date === o.tomorrow ? "tomorrow" : date <= o.weekEnd ? "week" : "later",
        state: "waiting",
        state_reason: basis[0].toUpperCase() + basis.slice(1),
        account: accountOf.get(c.account_id)!,
        contact: { ...contact, persona: t.persona ?? contact.persona },
      } as TodayStep);
    }
  }
  return out;
}
