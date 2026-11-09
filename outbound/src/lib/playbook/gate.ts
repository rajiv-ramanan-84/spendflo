import type { IsoDate } from "@/lib/calendar/dates";
import { JOB_PLAY, PLAY_CODES, PLAY_JOB, PLAY_SHORT, signalDef, type Job, type PlayCode } from "./catalog";
import type { ParsedSignal } from "./signals";

/**
 * The gate (Wedge doc): work an account when it fits and shows two different
 * signals within 90 days. Pure.
 *
 *   Hot      two or more different signals in 90 days for the play
 *   Warm     one
 *   Nurture  none fresh
 *   Not a fit  a disqualifier already applies (archived, no-fit)
 *
 * The level counts the whole account: every different fresh signal event,
 * whichever play it points to, counts once. One note tagged with two IDs
 * ("A1.S7/A2.S2: cost cuts") is one event, not two. The play is chosen separately, by the most
 * direct signals. So a new CFO (renewals) plus a new contract manager role
 * (redlining) make the account Hot, led by redlining. Undated, expired,
 * unlisted and fit-fact signals are listed but never counted.
 */

export const FRESH_DAYS = 90;
export type Level = "hot" | "warm" | "nurture" | "not_fit";
export const LEVEL_LABEL: Record<Level, string> = { hot: "Hot", warm: "Warm", nurture: "Nurture", not_fit: "Not a fit" };

export type EvaluatedSignal = ParsedSignal & { name: string; kind: "Direct" | "Context" | "Unknown"; plays: PlayCode[]; ageDays: number | null; fact: boolean };
export type PlayResult = {
  play: PlayCode | null;
  job: Job | null;
  level: Level;
  /** What the account would be if it had a fresh signal: the play its last signals pointed to. */
  pointsTo: PlayCode | null;
  counts: Record<PlayCode, { distinct: number; direct: number }>;
  /** Different fresh signals on the whole account. This sets the level. */
  signalCount: number;
  fresh: EvaluatedSignal[];
  stale: EvaluatedSignal[];
  /** Fit facts (employee count and the like): shown, never counted. */
  facts: EvaluatedSignal[];
  ignored: EvaluatedSignal[];
  lastSignalOn: IsoDate | null;
  reasons: string[];
};

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The owner's outreach angle note breaks a tie between plays. */
export function angleToPlay(note: string | null | undefined): PlayCode | null {
  const t = (note ?? "").toLowerCase();
  if (/redlin|contract review|supplier paper/.test(t)) return "A1";
  if (/renewal/.test(t)) return "A2";
  if (/guided buying|catalog|requester|maverick|off-catalog/.test(t)) return "A3";
  return null;
}

export function evaluatePlay(input: { signals: readonly ParsedSignal[]; today: IsoDate; angleNote?: string | null; notFit?: boolean }): PlayResult {
  const { today } = input;
  const evaluated: EvaluatedSignal[] = input.signals.map((s) => {
    const def = signalDef(s.id);
    return { ...s, name: def?.name ?? (s.id === "NEW" ? "New signal (not on the list)" : "Untagged note"), kind: def?.kind ?? "Unknown", plays: def?.feeds ?? [], ageDays: s.seenOn ? daysBetween(s.seenOn, today) : null, fact: !!def?.fact };
  });

  const fresh: EvaluatedSignal[] = [];
  const stale: EvaluatedSignal[] = [];
  const ignored: EvaluatedSignal[] = [];
  const facts: EvaluatedSignal[] = [];
  for (const s of evaluated) {
    if (s.fact) facts.push(s);
    else if (!s.plays.length || s.expired || s.ageDays === null || s.ageDays < 0) ignored.push(s);
    else if (s.ageDays <= FRESH_DAYS) fresh.push(s);
    else stale.push(s);
  }
  fresh.sort((a, b) => (a.ageDays ?? 0) - (b.ageDays ?? 0));
  stale.sort((a, b) => (a.ageDays ?? 0) - (b.ageDays ?? 0));

  // An event is one dated note, however many signal IDs it was tagged with.
  const eventKey = (s: EvaluatedSignal) => `${s.seenOn}|${s.evidence.toLowerCase().slice(0, 120)}`;
  // Two posts of the same signal type are one signal, not two.
  const sameKind = (s: EvaluatedSignal) => s.id;
  const counts = Object.fromEntries(PLAY_CODES.map((c) => [c, { distinct: 0, direct: 0 }])) as PlayResult["counts"];
  for (const c of PLAY_CODES) {
    const events = new Map<string, EvaluatedSignal[]>();
    for (const s of fresh) if (s.plays.includes(c)) events.set(eventKey(s), [...(events.get(eventKey(s)) ?? []), s]);
    // Within a play, a signal type already counted by another event doesn't count again.
    const types = new Set<string>();
    let distinct = 0, direct = 0;
    for (const group of events.values()) {
      const fresher = group.filter((s) => !types.has(sameKind(s)));
      if (!fresher.length) continue;
      fresher.forEach((s) => types.add(sameKind(s)));
      distinct++;
      if (fresher.some((s) => s.kind === "Direct")) direct++;
    }
    counts[c] = { distinct, direct };
  }
  const dated = evaluated.filter((s) => s.seenOn && !s.expired && !s.fact && s.plays.length).map((s) => s.seenOn!).sort();
  const lastSignalOn = dated[dated.length - 1] ?? null;
  const tie = angleToPlay(input.angleNote);
  const rank = (c: PlayCode) => [counts[c].direct, counts[c].distinct, tie === c ? 1 : 0, -PLAY_CODES.indexOf(c)];
  const best = [...PLAY_CODES].filter((c) => counts[c].distinct > 0).sort((a, b) => { const ra = rank(a), rb = rank(b); for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i]; return 0; })[0] ?? null;

  const reasons: string[] = [];
  // Account-wide count: group by event, freshest first. An event counts only if it brings a signal
  // type not already counted, so one note tagged twice is one signal, and two posts of one type are one.
  const byEvent = new Map<string, EvaluatedSignal[]>();
  for (const s of fresh) byEvent.set(eventKey(s), [...(byEvent.get(eventKey(s)) ?? []), s]);
  const counted = new Set<string>();
  let signalCount = 0;
  for (const group of byEvent.values()) {
    if (group.some((s) => !counted.has(s.id))) {
      signalCount++;
      group.forEach((s) => counted.add(s.id));
    }
  }
  if (input.notFit) return { play: null, job: null, level: "not_fit", pointsTo: null, counts, signalCount, fresh, stale, facts, ignored, lastSignalOn, reasons: ["The account is marked no-fit or archived."] };

  // Which play the older signals point to, so Nurture can say what it would be.
  const stalePlay = [...PLAY_CODES].map((c) => ({ c, n: stale.filter((s) => s.plays.includes(c)).length })).sort((a, b) => b.n - a.n)[0];
  const factPlay = facts.flatMap((f) => f.plays)[0] ?? null;
  const pointsTo: PlayCode | null = best ?? (stalePlay && stalePlay.n > 0 ? stalePlay.c : tie ?? factPlay);

  if (!best) {
    reasons.push(stale.length ? `No signal in the last ${FRESH_DAYS} days. The newest is ${stale[0].ageDays} days old (${stale[0].id}).` : `No dated signal yet.`);
    if (ignored.length) reasons.push(`${ignored.length} signal${ignored.length === 1 ? "" : "s"} can't count: undated, expired or not on the list.`);
    return { play: null, job: null, level: "nurture", pointsTo, counts, signalCount, fresh, stale, facts, ignored, lastSignalOn, reasons };
  }
  const n = signalCount;
  const ids = [...new Set(fresh.map((s) => s.id))];
  reasons.push(`${n} different signal${n === 1 ? "" : "s"} in the last ${FRESH_DAYS} days: ${ids.join(", ")}.`);
  const others = PLAY_CODES.filter((c) => c !== best && counts[c].distinct > 0);
  reasons.push(`Leading with ${PLAY_SHORT[best]}${others.length ? `: it has the most direct signals${tie === best ? " and matches the owner's note" : ""}. Also points to ${others.map((c) => `${PLAY_SHORT[c]} (${counts[c].distinct})`).join(", ")}, which can shape a secondary track` : ""}.`);
  return { play: best, job: PLAY_JOB[best], level: n >= 2 ? "hot" : "warm", pointsTo: best, counts, signalCount, fresh, stale, facts, ignored, lastSignalOn, reasons };
}

export const jobForPlay = (c: PlayCode) => PLAY_JOB[c];
export const playForJob = (j: string | null | undefined): PlayCode | null => (j && j in JOB_PLAY ? JOB_PLAY[j as Job] : null);
