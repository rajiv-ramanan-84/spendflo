import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionError } from "@/lib/campaigns/actions";

/**
 * Monthly Claude budget. Spend is what calls have cost this month, plus an
 * allowance for drafts still being written (their cost is only known when
 * they finish). Drafts and re-plans stop at the budget; reply sorting does not.
 */
const PENDING_DRAFT_ESTIMATE_USD = 0.3;

export type Spend = { spent: number; pending: number; budget: number; remaining: number; drafts: number; monthStart: string };

export async function monthSpend(db: SupabaseClient, now = new Date()): Promise<Spend> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [{ data: settings }, { data: calls }, { count: inFlight }] = await Promise.all([
    db.from("app_settings").select("claude_monthly_budget_usd").maybeSingle(),
    db.from("claude_calls").select("cost_usd, call_type").gte("created_at", monthStart).not("cost_usd", "is", null),
    db.from("claude_calls").select("id", { count: "exact", head: true }).eq("status", "running").not("batch_id", "is", null),
  ]);
  const spent = (calls ?? []).reduce((s, c) => s + Number(c.cost_usd ?? 0), 0);
  const pending = (inFlight ?? 0) * PENDING_DRAFT_ESTIMATE_USD;
  const budget = Number(settings?.claude_monthly_budget_usd ?? 50);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    spent: r2(spent), pending: r2(pending), budget, remaining: r2(budget - spent - pending),
    drafts: (calls ?? []).filter((c) => c.call_type === "generate_campaign").length, monthStart,
  };
}

/** Throws a plain-language error when this month's budget is used up. */
export async function assertBudget(db: SupabaseClient, what: "draft" | "re-plan", count = 1) {
  const s = await monthSpend(db);
  if (s.remaining < PENDING_DRAFT_ESTIMATE_USD * count) {
    throw new ActionError(`This month's Claude budget ($${s.budget}) is used up, so no new ${what} for now. An admin can raise it in Settings > Claude spend.`, 402);
  }
  return s;
}

export function draftsAffordable(s: Spend) {
  return Math.max(0, Math.floor(s.remaining / PENDING_DRAFT_ESTIMATE_USD));
}
