import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, type IsoDate } from "@/lib/calendar/dates";
import { addWorkingDays, type CalendarContext } from "@/lib/calendar/working-calendar";
import { focusOrder } from "@/lib/priority/score";

/** Everything the Today screen shows, for one person or the whole team. */

export type TodayStep = {
  id: string;
  due_date: string;
  bucket: "overdue" | "today" | "tomorrow" | "week";
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
  contact: { id: string; full_name: string; title: string | null; persona: string | null; email: string | null; linkedin_url: string | null; phone: string | null; country: string | null };
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

export type FocusCard = { id: string; name: string; tier: string | null; score: number; reasons: string[]; pinned: boolean; nextAction: string | null; nextStepId: string | null; campaignStatus: string | null };

const TIER_RANK: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

export async function loadToday(db: SupabaseClient, opts: { userId: string | null; scope: "mine" | "team"; today: IsoDate; ctx: CalendarContext }) {
  const { today, ctx } = opts;
  const tomorrow = addWorkingDays(today, 1, {}, ctx);
  const weekEnd = addDays(today, 7);

  let stepsQ = db.from("steps")
    .select("id, due_date, status, channel, subject, body, call_script, moved_reason, gmail_draft_id, gmail_message_id, sequence_no, assignee_id, track_id, campaign_id, contact_id, original_body, original_date, offset_working_days, completed_at, outcome_note")
    .in("status", ["upcoming", "due", "overdue"]).is("deleted_at", null).not("due_date", "is", null).lte("due_date", weekEnd);
  if (opts.scope === "mine" && opts.userId) stepsQ = stepsQ.eq("assignee_id", opts.userId);
  const { data: rawSteps } = await stepsQ;

  // Only steps of live campaigns and active tracks belong on Today.
  const campIds = [...new Set((rawSteps ?? []).map((s) => s.campaign_id))];
  const trackIds = [...new Set((rawSteps ?? []).map((s) => s.track_id))];
  const contactIds = [...new Set((rawSteps ?? []).map((s) => s.contact_id))];
  const [{ data: camps }, { data: tracks }, { data: contacts }] = await Promise.all([
    campIds.length ? db.from("campaigns").select("id, account_id, status").in("id", campIds) : Promise.resolve({ data: [] as Array<{ id: string; account_id: string; status: string }> }),
    trackIds.length ? db.from("contact_tracks").select("id, status, persona").in("id", trackIds) : Promise.resolve({ data: [] as Array<{ id: string; status: string; persona: string | null }> }),
    contactIds.length ? db.from("contacts").select("id, full_name, title, persona, email, linkedin_url, phone, country").in("id", contactIds) : Promise.resolve({ data: [] as TodayStep["contact"][] }),
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
      return c && ["active", "responded", "meeting_booked"].includes(c.status) && t && t.status === "active";
    })
    .map((s) => {
      const c = campMap.get(s.campaign_id)!;
      const contact = contactMap.get(s.contact_id)!;
      return {
        ...s,
        bucket: s.due_date! < today ? "overdue" : s.due_date === today ? "today" : s.due_date === tomorrow ? "tomorrow" : "week",
        account: accountMap.get(c.account_id)!,
        contact: { ...contact, persona: trackMap.get(s.track_id)?.persona ?? contact.persona },
      } as TodayStep;
    })
    .sort((a, b) => (TIER_RANK[a.account.tier ?? ""] ?? 9) - (TIER_RANK[b.account.tier ?? ""] ?? 9) || a.due_date.localeCompare(b.due_date) || a.account.name.localeCompare(b.account.name));

  // Replies waiting: detected and not yet confirmed, or confirmed and not yet re-planned.
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

  // Focus Today: my accounts (or everyone's), ranked.
  let focusQ = db.from("accounts").select("id, name, tier, priority_score, priority_reasons").eq("archived", false).is("deleted_at", null);
  if (opts.scope === "mine" && opts.userId) focusQ = focusQ.eq("owner_id", opts.userId);
  const [{ data: focusAccounts }, { data: pins }, { data: rollup }] = await Promise.all([
    focusQ.order("priority_score", { ascending: false }).limit(200),
    opts.userId ? db.from("account_pins").select("account_id").eq("user_id", opts.userId) : Promise.resolve({ data: [] as Array<{ account_id: string }> }),
    db.from("account_rollup").select("account_id, campaign_status"),
  ]);
  const pinned = new Set((pins ?? []).map((p) => p.account_id));
  const statusOf = new Map((rollup ?? []).map((r) => [r.account_id, r.campaign_status as string | null]));
  const firstStep = new Map<string, TodayStep>();
  for (const s of steps) if (!firstStep.has(s.account.id)) firstStep.set(s.account.id, s);
  const focus: FocusCard[] = focusOrder(
    (focusAccounts ?? []).map((a) => ({
      id: a.id, name: a.name, tier: a.tier, score: a.priority_score ?? 0, reasons: (a.priority_reasons as string[]) ?? [], pinned: pinned.has(a.id),
      campaignStatus: statusOf.get(a.id) ?? null,
      nextStepId: firstStep.get(a.id)?.id ?? null,
      nextAction: replies.some((r) => r.account?.id === a.id) ? "Re-plan" : firstStep.get(a.id) ? "Open next step" : statusOf.get(a.id) === "draft" ? "Review draft" : !statusOf.get(a.id) ? "Generate" : "Open",
    })),
    10,
  );

  // Header strip
  let doneQ = db.from("steps").select("id", { count: "exact", head: true }).eq("status", "done").gte("completed_at", `${today}T00:00:00`);
  if (opts.scope === "mine" && opts.userId) doneQ = doneQ.eq("completed_by", opts.userId);
  const { count: doneToday } = await doneQ;

  return {
    steps,
    replies,
    focus,
    header: {
      dueToday: steps.filter((s) => s.bucket === "today").length,
      doneToday: doneToday ?? 0,
      overdue: steps.filter((s) => s.bucket === "overdue").length,
      replies: replies.length,
    },
    tomorrow,
  };
}
