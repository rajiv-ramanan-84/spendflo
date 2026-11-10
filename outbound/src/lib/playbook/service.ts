import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayIn, type IsoDate } from "@/lib/calendar/dates";
import { loadCalendarContext } from "@/lib/calendar/context";
import { nextValidDate } from "@/lib/calendar/working-calendar";
import { PLAY_SHORT } from "./catalog";
import { evaluateFit, liveSignalIds } from "./fit";
import { LEVEL_LABEL, START_WITHIN_HOURS } from "./gate";
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
  let q = db.from("accounts").select("id, name, owner_id, signals, vendor_signals, outreach_angle, archived, icp_verdict, do_not_contact, play_level, level_since, start_by, coupa_evidence, employees, disqualifier_flags, custom_fields").is("deleted_at", null);
  if (opts.accountIds?.length) q = q.in("id", opts.accountIds);
  const { data: accounts, error } = await q.limit(5000);
  if (error) throw new Error(`Play refresh could not read accounts: ${error.message}`);
  const ids = (accounts ?? []).map((a) => a.id);
  if (!ids.length) return { accounts: 0, superHot: 0, hot: 0, warm: 0, nurture: 0, notFit: 0 };

  const existing: Array<{ id: string; account_id: string; line_key: string }> = [];
  for (const part of chunk(ids, 100)) {
    const { data } = await db.from("account_signals").select("id, account_id, line_key").eq("source", "master").in("account_id", part);
    existing.push(...(data ?? []));
  }
  const have = new Map<string, Map<string, string>>();
  for (const e of existing) have.set(e.account_id, (have.get(e.account_id) ?? new Map()).set(e.line_key, e.id));

  // Who is on each account's contact list, for the fit checks.
  const personasOf = new Map<string, string[]>();
  for (const part of chunk(ids, 100)) {
    const { data } = await db.from("contacts").select("account_id, persona").in("account_id", part).is("deleted_at", null).is("sheet_deleted_at", null);
    for (const c of data ?? []) if (c.persona) personasOf.set(c.account_id as string, [...(personasOf.get(c.account_id as string) ?? []), c.persona as string]);
  }

  // Accounts already running a campaign don't need a start deadline.
  const running = new Set<string>();
  for (const part of chunk(ids, 100)) {
    const { data } = await db.from("account_rollup").select("account_id, campaign_status").in("account_id", part);
    for (const r of data ?? []) if (["active", "paused", "responded", "meeting_booked"].includes(r.campaign_status as string)) running.add(r.account_id as string);
  }
  const ctx = await loadCalendarContext(db, [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
  const alerts: Array<Record<string, unknown>> = [];
  const insert: Array<Record<string, unknown>> = [];
  const remove: string[] = [];
  const tally = { accounts: 0, superHot: 0, hot: 0, warm: 0, nurture: 0, notFit: 0 };
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
    if (r.level === "super_hot") tally.superHot++; else if (r.level === "hot") tally.hot++; else if (r.level === "warm") tally.warm++; else if (r.level === "nurture") tally.nurture++; else tally.notFit++;

    // When it reached this level, and when its first activity is due: 24 hours for super hot, 48 for hot.
    const prevLevel = a.play_level as string | null;
    const changed = r.level !== prevLevel;
    const urgent = r.level === "super_hot" || r.level === "hot";
    let startBy: string | null = null;
    if (urgent && !running.has(a.id)) {
      const computed = nextValidDate(addDays(today, START_WITHIN_HOURS[r.level]! >= 48 ? 2 : 0), {}, ctx);
      const kept = (a.start_by as string | null) ?? null;
      // Reaching a higher level can only pull the deadline earlier; a level that slips never pushes it out.
      startBy = kept && (prevLevel === "super_hot" || prevLevel === "hot") ? (kept < computed ? kept : computed) : computed;
      if (changed && a.owner_id) alerts.push({ user_id: a.owner_id, type: "account_urgent", entity_type: "account", entity_id: a.id, message: `${LEVEL_LABEL[r.level]}: ${a.name}. ${r.play ? PLAY_SHORT[r.play] + ". " : ""}Start within ${START_WITHIN_HOURS[r.level]} hours.` });
    }
    const fit = evaluateFit({
      coupaEvidence: (a.coupa_evidence as string | null) ?? null, employees: (a.employees as string | null) ?? null,
      disqualifierFlags: (a.disqualifier_flags as string | null) ?? null,
      researchFit: ((a.custom_fields as Record<string, unknown> | null)?.["Fit Agent(s)"] as string | undefined) ?? null,
      personas: personasOf.get(a.id) ?? [], liveSignalIds: liveSignalIds(parsed),
    });
    const { error: upErr } = await db.from("accounts").update({
      fit_level: fit.level, fit_best_play: fit.best, fit_scores: fit.plays.map((p) => ({ play: p.play, level: p.level, score: p.score, met: p.met, evaluable: p.evaluable, unknown: p.unknown, checks: p.checks })), fit_computed_at: now,
      play: r.play, play_level: r.level, play_points_to: r.pointsTo, play_reasons: r.reasons,
      play_signal_count: r.level === "hot" ? r.signalCount180 : r.signalCount, last_signal_on: r.lastSignalOn, play_computed_at: now,
      play_cooling: r.cooling, level_since: changed ? now : (a.level_since ?? now), start_by: startBy,
    }).eq("id", a.id);
    if (upErr) throw new Error(`Play refresh could not save ${a.id}: ${upErr.message}`);
  }
  for (const part of chunk(remove)) await db.from("account_signals").delete().in("id", part);
  for (const part of chunk(alerts)) await db.from("notifications").insert(part);
  for (const part of chunk(insert)) {
    const { error: insErr } = await db.from("account_signals").insert(part);
    if (insErr) throw new Error(`Play refresh could not save signals: ${insErr.message}`);
  }
  return tally;
}
