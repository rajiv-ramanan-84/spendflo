import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** What the Settings card shows about the vendor feed: is it on, what each recent run did, and why rows are rejected. */
export async function loadFeedSettings(db: SupabaseClient) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: runs }, { data: rows }] = await Promise.all([
    db.from("signal_feed_runs").select("started_at, rows_read, accepted, duplicates, rejected, deferred, accounts_touched, error").order("started_at", { ascending: false }).limit(8),
    db.from("signal_feed_rows").select("status, reason").gte("decided_at", since).limit(5000),
  ]);
  const week: { accepted: number; duplicate: number; rejected: number; deferred: number } = { accepted: 0, duplicate: 0, rejected: 0, deferred: 0 };
  const reasons = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.status === "accepted" || r.status === "duplicate" || r.status === "rejected" || r.status === "deferred") week[r.status as "accepted" | "duplicate" | "rejected" | "deferred"]++;
    if (r.status === "rejected" && r.reason) reasons.set(r.reason as string, (reasons.get(r.reason as string) ?? 0) + 1);
  }
  const decided = week.accepted + week.duplicate + week.rejected;
  return {
    configured: !!process.env.GOOGLE_SIGNALS_SHEET_ID,
    runs: (runs ?? []).map((r) => ({ at: r.started_at as string, read: r.rows_read as number, accepted: r.accepted as number, duplicates: r.duplicates as number, rejected: r.rejected as number, held: r.deferred as number, accounts: r.accounts_touched as number, error: (r.error as string | null) ?? null })),
    week: { ...week, acceptedRate: decided ? Math.round((week.accepted / decided) * 100) : null },
    topReasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
  };
}
