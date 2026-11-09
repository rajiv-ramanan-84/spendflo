import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIn, type IsoDate } from "@/lib/calendar/dates";
import { playForAccount } from "./payload";
import { parseSignals, type ParsedSignal } from "./signals";

/**
 * Keeps account_signals equal to the Signals cell and recomputes each
 * account's play and level. Runs after every sheet sync and every morning,
 * because a signal ages out of the 90 day window without anyone editing the Sheet.
 */

const chunk = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
export const lineKey = (s: ParsedSignal) => `${s.id}|${s.seenOn ?? ""}|${s.evidence.toLowerCase().slice(0, 120)}`;

export async function refreshPlays(db: SupabaseClient, opts: { accountIds?: string[]; today?: IsoDate } = {}) {
  const today = opts.today ?? todayIn();
  let q = db.from("accounts").select("id, signals, outreach_angle, archived, icp_verdict, do_not_contact").is("deleted_at", null);
  if (opts.accountIds?.length) q = q.in("id", opts.accountIds);
  const { data: accounts, error } = await q.limit(5000);
  if (error) throw new Error(`Play refresh could not read accounts: ${error.message}`);
  const ids = (accounts ?? []).map((a) => a.id);
  if (!ids.length) return { accounts: 0, hot: 0, warm: 0, nurture: 0, notFit: 0 };

  const existing: Array<{ id: string; account_id: string; line_key: string }> = [];
  for (const part of chunk(ids, 100)) {
    const { data } = await db.from("account_signals").select("id, account_id, line_key").in("account_id", part);
    existing.push(...(data ?? []));
  }
  const have = new Map<string, Map<string, string>>();
  for (const e of existing) have.set(e.account_id, (have.get(e.account_id) ?? new Map()).set(e.line_key, e.id));

  const insert: Array<Record<string, unknown>> = [];
  const remove: string[] = [];
  const tally = { accounts: 0, hot: 0, warm: 0, nurture: 0, notFit: 0 };
  const now = new Date().toISOString();

  for (const a of accounts ?? []) {
    const parsed = parseSignals(a.signals);
    const keys = new Map(parsed.map((s) => [lineKey(s), s]));
    const mine = have.get(a.id) ?? new Map<string, string>();
    for (const [k, s] of keys) {
      if (!mine.has(k)) insert.push({ account_id: a.id, signal_id: s.id, seen_on: s.seenOn, evidence: s.evidence, source_url: s.url, confidence: s.confidence, expired: s.expired, legacy: s.legacy, line_key: k });
    }
    for (const [k, id] of mine) if (!keys.has(k)) remove.push(id);

    const r = playForAccount(a, today);
    tally.accounts++;
    if (r.level === "hot") tally.hot++; else if (r.level === "warm") tally.warm++; else if (r.level === "nurture") tally.nurture++; else tally.notFit++;
    const { error: upErr } = await db.from("accounts").update({
      play: r.play, play_level: r.level, play_points_to: r.pointsTo, play_reasons: r.reasons,
      play_signal_count: r.play ? r.counts[r.play].distinct : 0, last_signal_on: r.lastSignalOn, play_computed_at: now,
    }).eq("id", a.id);
    if (upErr) throw new Error(`Play refresh could not save ${a.id}: ${upErr.message}`);
  }
  for (const part of chunk(remove)) await db.from("account_signals").delete().in("id", part);
  for (const part of chunk(insert)) {
    const { error: insErr } = await db.from("account_signals").insert(part);
    if (insErr) throw new Error(`Play refresh could not save signals: ${insErr.message}`);
  }
  return tally;
}
