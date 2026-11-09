import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldAutoDraft, type AutoDraftMode } from "./auto-draft";

const MAX_PER_RUN = 25;
const chunk = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Queues a draft for every account that has earned one and has none yet. Runs after each sync,
 * so an account that earns a signal next month is picked up too, not only accounts imported today.
 * Nothing launches without the owner.
 */
export async function queueOvernightDrafts(db: SupabaseClient, mode: AutoDraftMode): Promise<number> {
  if (mode === "off") return 0;
  const { data: rows, error } = await db.from("accounts")
    .select("id, tier, play_level, fit_level, owner_id")
    .is("deleted_at", null).eq("archived", false).eq("do_not_contact", false).not("owner_id", "is", null)
    .in("play_level", ["super_hot", "hot", "warm"]).limit(2000);
  if (error) throw new Error(`Overnight drafts could not read accounts: ${error.message}`);
  const eligible = (rows ?? []).filter((r) => shouldAutoDraft({ mode, level: r.play_level as string, tier: r.tier as string | null }));
  if (!eligible.length) return 0;

  const ids = eligible.map((r) => r.id as string);
  const skip = new Set<string>();
  const usable = new Set<string>();
  for (const part of chunk(ids)) {
    const [{ data: camps }, { data: calls }, { data: people }] = await Promise.all([
      db.from("campaigns").select("account_id").in("account_id", part).is("deleted_at", null),
      db.from("claude_calls").select("account_id").eq("call_type", "generate_campaign").in("account_id", part).in("status", ["queued", "running"]),
      db.from("contacts").select("account_id").in("account_id", part).is("deleted_at", null).is("sheet_deleted_at", null).eq("exclude", false).eq("do_not_contact", false),
    ]);
    for (const c of camps ?? []) skip.add(c.account_id as string);
    for (const c of calls ?? []) skip.add(c.account_id as string);
    for (const c of people ?? []) usable.add(c.account_id as string);
  }
  // Most urgent first, so a busy night spends on the hottest accounts.
  const rank: Record<string, number> = { super_hot: 0, hot: 1, warm: 2 };
  const todo = eligible
    .filter((r) => !skip.has(r.id as string) && usable.has(r.id as string))
    .sort((a, b) => rank[a.play_level as string] - rank[b.play_level as string])
    .slice(0, MAX_PER_RUN)
    .map((r) => ({ call_type: "generate_campaign", account_id: r.id, status: "queued" }));
  if (todo.length) {
    const { error: e } = await db.from("claude_calls").insert(todo);
    if (e) throw new Error(`Queue drafts: ${e.message}`);
  }
  return todo.length;
}
