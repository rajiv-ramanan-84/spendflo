import { refreshPlays } from "@/lib/playbook/service";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayIn, type IsoDate } from "@/lib/calendar/dates";
import { addWorkingDays, workingDaysBetween } from "@/lib/calendar/working-calendar";
import { loadPlanningContext } from "@/lib/campaigns/context";
import { DEFAULT_WEIGHTS, priorityScore, type PriorityWeights } from "@/lib/priority/score";

/**
 * Daily refresh (and after any logged event, for one account):
 * 1. step statuses: Due today, Overdue after
 * 2. priority score and reasons for every active account
 * 3. campaigns with nothing left to send close as Closed, no response
 *    5 working days after the last step, with a Recycle date 90 days out
 */

const LIVE = ["active", "paused", "responded", "meeting_booked"];

export async function refreshStepStatuses(db: SupabaseClient, today: IsoDate) {
  await db.from("steps").update({ status: "overdue" }).in("status", ["upcoming", "due"]).lt("due_date", today).is("deleted_at", null);
  await db.from("steps").update({ status: "due" }).in("status", ["upcoming", "overdue"]).eq("due_date", today).is("deleted_at", null);
  await db.from("steps").update({ status: "upcoming" }).in("status", ["due", "overdue"]).gt("due_date", today).is("deleted_at", null);
}

export async function refreshPriorities(db: SupabaseClient, onlyAccountId?: string) {
  const p = await loadPlanningContext(db);
  const today = p.today;
  const weights: PriorityWeights = { ...DEFAULT_WEIGHTS, ...(p.settings.priority_weights as Partial<PriorityWeights>) };

  let accountsQ = db.from("accounts").select("id, tier, trigger_date, owner_id, owner_assigned_at").eq("archived", false).is("deleted_at", null);
  if (onlyAccountId) accountsQ = accountsQ.eq("id", onlyAccountId);
  const { data: accounts } = await accountsQ;
  if (!accounts?.length) return 0;
  const ids = accounts.map((a) => a.id);

  const { data: campaigns } = await db.from("campaigns").select("id, account_id, status").in("account_id", ids).is("deleted_at", null).in("status", ["draft", ...LIVE]);
  const campIds = (campaigns ?? []).map((c) => c.id);
  const [{ data: steps }, { data: responses }] = await Promise.all([
    campIds.length ? db.from("steps").select("campaign_id, status, due_date, completed_at, channel, linkedin_accepted_at").in("campaign_id", campIds).is("deleted_at", null) : Promise.resolve({ data: [] as never[] }),
    db.from("responses").select("account_id, state, campaign_id, classification").in("account_id", ids).in("state", ["pending", "confirmed"]),
  ]);
  const campByAccount = new Map<string, Array<{ id: string; status: string }>>();
  for (const c of campaigns ?? []) campByAccount.set(c.account_id, [...(campByAccount.get(c.account_id) ?? []), c]);

  for (const a of accounts) {
    const camps = campByAccount.get(a.id) ?? [];
    const live = camps.filter((c) => LIVE.includes(c.status));
    const s = (steps ?? []).filter((x) => camps.some((c) => c.id === x.campaign_id));
    const open = s.filter((x) => ["upcoming", "due", "overdue"].includes(x.status));
    const doneDates = s.filter((x) => x.completed_at).map((x) => x.completed_at!.slice(0, 10)).sort();
    const lastTouch = doneDates[doneDates.length - 1] ?? null;
    const accepted = s.filter((x) => x.linkedin_accepted_at && x.linkedin_accepted_at.slice(0, 10) >= addDays(today, -3)).map((x) => x.linkedin_accepted_at!.slice(0, 10));
    const warm = accepted.some((d) => !doneDates.some((dd) => dd > d));
    const replyWaiting = (responses ?? []).some((r) => r.account_id === a.id && (r.state === "pending" || camps.some((c) => c.id === r.campaign_id && c.status === "responded")));
    const assignedOn = a.owner_assigned_at ? a.owner_assigned_at.slice(0, 10) : null;

    const { score, reasons } = priorityScore({
      tier: a.tier,
      replyWaiting,
      hasOverdue: open.some((x) => x.due_date && x.due_date < today),
      hasDueToday: open.some((x) => x.due_date === today),
      warmAccepted: warm,
      newTrigger: !!a.trigger_date && a.trigger_date >= addDays(today, -14) && a.trigger_date <= today,
      workingDaysAssignedWithoutLaunch: a.owner_id && !live.length && assignedOn ? workingDaysBetween(assignedOn, today, {}, p.ctx) : null,
      daysSinceLastTouch: live.length ? (lastTouch ? Math.round((Date.parse(today) - Date.parse(lastTouch)) / 86_400_000) : null) : null,
      pinned: false,
    }, weights);
    await db.from("accounts").update({ priority_score: score, priority_reasons: reasons, priority_computed_at: new Date().toISOString() }).eq("id", a.id);
  }
  return accounts.length;
}

export async function autoCloseFinishedCampaigns(db: SupabaseClient, today: IsoDate) {
  const p = await loadPlanningContext(db);
  const { data: active } = await db.from("campaigns").select("id, account_id").eq("status", "active").is("deleted_at", null);
  let closed = 0;
  for (const c of active ?? []) {
    const [{ data: open }, { data: last }, { data: replies }] = await Promise.all([
      db.from("steps").select("id").eq("campaign_id", c.id).in("status", ["upcoming", "due", "overdue"]).is("deleted_at", null).limit(1),
      db.from("steps").select("due_date").eq("campaign_id", c.id).in("status", ["done", "skipped"]).order("due_date", { ascending: false }).limit(1),
      db.from("responses").select("id").eq("campaign_id", c.id).neq("state", "dismissed").not("classification", "in", "(auto_reply,bounce)").limit(1),
    ]);
    if (open?.length || replies?.length || !last?.[0]?.due_date) continue;
    // Tracks still waiting on a reply never fired, so they don't keep the campaign open.
    const closeOn = addWorkingDays(last[0].due_date, 5, {}, p.ctx);
    if (today < closeOn) continue;
    await db.from("campaigns").update({ status: "closed_no_response", closed_at: new Date().toISOString(), recycle_date: addDays(today, 90), closed_reason: "No response 5 working days after the last step" }).eq("id", c.id);
    closed++;
  }
  return closed;
}

export async function runDailyRefresh(db: SupabaseClient) {
  const today = todayIn();
  await refreshStepStatuses(db, today);
  const closed = await autoCloseFinishedCampaigns(db, today);
  // Signals age out of the 90 day window on their own, so levels are recomputed every morning.
  const plays = await refreshPlays(db, { today });
  const scored = await refreshPriorities(db);
  return { today, closed, scored, plays };
}
