import type { IsoDate } from "@/lib/calendar/dates";
import { JOB_PLAY, PLAY_CODES, PLAY_JOB, PLAY_SHORT, signalDef, type Job, type PlayCode } from "./catalog";
import type { ParsedSignal } from "./signals";

/**
 * The gate (Wedge doc, extended): how urgent is this account? Pure.
 *
 *   Super hot  2 or more different signals, both within 90 days. Start within 24 hours.
 *   Hot        2 or more different signals within 180 days (one older than 90). Start within 48 hours.
 *   Warm       1 signal within 90 days.
 *   Nurture    nothing within 90 days. One signal 91 to 180 days old is shown as Cooling.
 *   Not a fit  a disqualifier already applies (archived, no-fit)
 *
 * The level counts the whole account: every different signal event, whichever
 * play it points to, counts once. One note tagged with two IDs ("A1.S7/A2.S2:
 * cost cuts") is one event, and two posts of one signal type are one signal.
 * The play is chosen separately, by the most direct signals. Undated, expired,
 * unlisted and fit-fact signals are listed but never counted.
 */

export const FRESH_DAYS = 90;
export const AGING_DAYS = 180;
export type Level = "super_hot" | "hot" | "warm" | "nurture" | "not_fit";
export const LEVEL_LABEL: Record<Level, string> = { super_hot: "Super hot", hot: "Hot", warm: "Warm", nurture: "Nurture", not_fit: "Not a fit" };
/** How soon the first activity must start once an account reaches the level. */
export const START_WITHIN_HOURS: Partial<Record<Level, number>> = { super_hot: 24, hot: 48 };

export type EvaluatedSignal = ParsedSignal & { name: string; kind: "Direct" | "Context" | "Unknown"; plays: PlayCode[]; ageDays: number | null; fact: boolean };
export type PlayResult = {
  play: PlayCode | null;
  job: Job | null;
  level: Level;
  /** What the account would be if it had a fresh signal: the play its last signals pointed to. */
  pointsTo: PlayCode | null;
  /** Per play, different events within 180 days. Used to choose the play. */
  counts: Record<PlayCode, { distinct: number; direct: number }>;
  /** Different signal events within 90 days. */
  signalCount: number;
  /** Different signal events within 180 days. */
  signalCount180: number;
  /** Nurture with exactly one signal 91 to 180 days old. */
  cooling: boolean;
  /** Up to 90 days old: counts fully. */
  fresh: EvaluatedSignal[];
  /** 91 to 180 days old: counts toward Hot, not toward Super hot. */
  aging: EvaluatedSignal[];
  /** Older than 180 days: history. */
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

/** Group signals into events (one dated note, however many IDs) and count an event only if it brings a signal type not yet counted. Freshest first. */
function countEvents(list: readonly EvaluatedSignal[]): number {
  const byEvent = new Map<string, EvaluatedSignal[]>();
  for (const s of list) {
    const k = `${s.seenOn}|${s.evidence.toLowerCase().slice(0, 120)}`;
    byEvent.set(k, [...(byEvent.get(k) ?? []), s]);
  }
  const counted = new Set<string>();
  let n = 0;
  for (const group of byEvent.values()) {
    if (group.some((s) => !counted.has(s.id))) {
      n++;
      group.forEach((s) => counted.add(s.id));
    }
  }
  return n;
}

export function evaluatePlay(input: { signals: readonly ParsedSignal[]; today: IsoDate; angleNote?: string | null; notFit?: boolean }): PlayResult {
  const { today } = input;
  const evaluated: EvaluatedSignal[] = input.signals.map((s) => {
    const def = signalDef(s.id);
    return { ...s, name: def?.name ?? (s.id === "NEW" ? "New signal (not on the list)" : "Untagged note"), kind: def?.kind ?? "Unknown", plays: def?.feeds ?? [], ageDays: s.seenOn ? daysBetween(s.seenOn, today) : null, fact: !!def?.fact };
  });

  const fresh: EvaluatedSignal[] = [];
  const aging: EvaluatedSignal[] = [];
  const stale: EvaluatedSignal[] = [];
  const ignored: EvaluatedSignal[] = [];
  const facts: EvaluatedSignal[] = [];
  for (const s of evaluated) {
    if (s.fact) facts.push(s);
    else if (!s.plays.length || s.expired || s.ageDays === null || s.ageDays < 0) ignored.push(s);
    else if (s.ageDays <= FRESH_DAYS) fresh.push(s);
    else if (s.ageDays <= AGING_DAYS) aging.push(s);
    else stale.push(s);
  }
  const byAge = (a: EvaluatedSignal, b: EvaluatedSignal) => (a.ageDays ?? 0) - (b.ageDays ?? 0);
  fresh.sort(byAge); aging.sort(byAge); stale.sort(byAge);

  const signalCount = countEvents(fresh);
  const signalCount180 = countEvents([...fresh, ...aging]);

  // The play is chosen from everything inside 180 days: a Hot account can rest on an older signal.
  const live = [...fresh, ...aging];
  const eventKey = (s: EvaluatedSignal) => `${s.seenOn}|${s.evidence.toLowerCase().slice(0, 120)}`;
  const counts = Object.fromEntries(PLAY_CODES.map((c) => [c, { distinct: 0, direct: 0 }])) as PlayResult["counts"];
  for (const c of PLAY_CODES) {
    const events = new Map<string, EvaluatedSignal[]>();
    for (const s of live) if (s.plays.includes(c)) events.set(eventKey(s), [...(events.get(eventKey(s)) ?? []), s]);
    const types = new Set<string>();
    let distinct = 0, direct = 0;
    for (const group of events.values()) {
      const newer = group.filter((s) => !types.has(s.id));
      if (!newer.length) continue;
      newer.forEach((s) => types.add(s.id));
      distinct++;
      if (newer.some((s) => s.kind === "Direct")) direct++;
    }
    counts[c] = { distinct, direct };
  }
  const dated = evaluated.filter((s) => s.seenOn && !s.expired && !s.fact && s.plays.length).map((s) => s.seenOn!).sort();
  const lastSignalOn = dated[dated.length - 1] ?? null;
  const tie = angleToPlay(input.angleNote);
  const rank = (c: PlayCode) => [counts[c].direct, counts[c].distinct, tie === c ? 1 : 0, -PLAY_CODES.indexOf(c)];
  const best = [...PLAY_CODES].filter((c) => counts[c].distinct > 0).sort((a, b) => { const ra = rank(a), rb = rank(b); for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i]; return 0; })[0] ?? null;

  const reasons: string[] = [];
  const base = { counts, signalCount, signalCount180, fresh, aging, stale, facts, ignored, lastSignalOn };
  if (input.notFit) return { ...base, play: null, job: null, level: "not_fit", pointsTo: null, cooling: false, reasons: ["The account is marked no-fit or archived."] };

  const level: Level = signalCount >= 2 ? "super_hot" : signalCount180 >= 2 ? "hot" : signalCount >= 1 ? "warm" : "nurture";
  const stalePlay = [...PLAY_CODES].map((c) => ({ c, n: [...aging, ...stale].filter((s) => s.plays.includes(c)).length })).sort((a, b) => b.n - a.n)[0];
  const factPlay = facts.flatMap((f) => f.plays)[0] ?? null;
  const pointsTo: PlayCode | null = best ?? (stalePlay && stalePlay.n > 0 ? stalePlay.c : tie ?? factPlay);

  if (level === "nurture") {
    const cooling = signalCount180 === 1;
    const newest = [...aging, ...stale][0];
    reasons.push(newest ? `No signal in the last ${FRESH_DAYS} days. The newest is ${newest.ageDays} days old (${newest.id}).${cooling ? " Cooling: one signal inside 180 days." : ""}` : `No dated signal yet.`);
    if (ignored.length) reasons.push(`${ignored.length} signal${ignored.length === 1 ? "" : "s"} can't count: undated, expired or not on the list.`);
    return { ...base, play: null, job: null, level, pointsTo, cooling, reasons };
  }

  const ids = [...new Set(live.map((s) => s.id))];
  if (level === "hot") {
    const older = aging.map((s) => `${s.id} (${s.ageDays} days)`).join(", ");
    reasons.push(`${signalCount180} different signals within ${AGING_DAYS} days: ${ids.join(", ")}. ${older} ${aging.length === 1 ? "is" : "are"} older than ${FRESH_DAYS} days, so this is Hot, not Super hot.`);
  } else {
    const n = signalCount;
    reasons.push(`${n} different signal${n === 1 ? "" : "s"} in the last ${FRESH_DAYS} days: ${[...new Set(fresh.map((s) => s.id))].join(", ")}.`);
  }
  const others = PLAY_CODES.filter((c) => best && c !== best && counts[c].distinct > 0);
  reasons.push(`Leading with ${PLAY_SHORT[best!]}${others.length ? `: it has the most direct signals${tie === best ? " and matches the owner's note" : ""}. Also points to ${others.map((c) => `${PLAY_SHORT[c]} (${counts[c].distinct})`).join(", ")}, which can shape a secondary track` : ""}.`);
  const within = START_WITHIN_HOURS[level];
  if (within) reasons.push(`Start within ${within} hours.`);
  return { ...base, play: best, job: best ? PLAY_JOB[best] : null, level, pointsTo: best, cooling: false, reasons };
}

export const jobForPlay = (c: PlayCode) => PLAY_JOB[c];
export const playForJob = (j: string | null | undefined): PlayCode | null => (j && j in JOB_PLAY ? JOB_PLAY[j as Job] : null);
