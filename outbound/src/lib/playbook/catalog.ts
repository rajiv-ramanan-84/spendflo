import data from "./playbook.json";

/**
 * The playbook's fixed vocabulary: three plays, 24 play signals (A1.S1 to
 * A3.S8) and 8 account events (E1 to E8). Source of truth is playbook.json,
 * the same data the team reviewed. Pure.
 */

export type PlayCode = "A1" | "A2" | "A3";
export type Job = "redlining" | "renewals" | "guided_buying";
export type SignalKind = "Direct" | "Context";
export type Frequency = "Daily" | "Weekly" | "Monthly";

export const PLAY_CODES: readonly PlayCode[] = ["A1", "A2", "A3"];
export const PLAY_JOB: Record<PlayCode, Job> = { A1: "redlining", A2: "renewals", A3: "guided_buying" };
export const JOB_PLAY: Record<Job, PlayCode> = { redlining: "A1", renewals: "A2", guided_buying: "A3" };
export const PLAY_NAME: Record<PlayCode, string> = { A1: "Contract review and redlining", A2: "Renewal intelligence", A3: "Guided buying" };
export const PLAY_SHORT: Record<PlayCode, string> = { A1: "Redlining", A2: "Renewals", A3: "Guided buying" };

/** Labels for any job value ever saved, including old campaigns that used sweep or ap. */
export const JOB_LABEL: Record<string, string> = {
  redlining: "Redlining", renewals: "Renewals", guided_buying: "Guided buying", sweep: "Contract sweep (retired)", ap: "AP (retired)", other: "Other",
};

export type SignalDef = { id: string; name: string; find: string; freq: Frequency; kind: SignalKind; feeds: PlayCode[]; event: boolean; fact: boolean };

/**
 * Fit facts: slow-moving facts about the account (employee count, legal team
 * size). They show on the page and help judge fit, but they are never a trigger,
 * so they never count toward Hot or Warm. Otherwise every large company would
 * carry one fresh signal forever.
 */
export const FIT_FACT_IDS = new Set(["A3.S6", "E5"]);

type RawPlay = { agent: string; signals: string[][] };
type RawEvent = { id: string; name: string; find: string; freq: string; kind: string; feeds: string[] };

export const SIGNALS: readonly SignalDef[] = [
  ...(data.plays as unknown as RawPlay[]).flatMap((p) =>
    p.signals.map(([sid, name, find, freq, kind]) => ({ id: `${p.agent}.${sid}`, name, find, freq: freq as Frequency, kind: kind as SignalKind, feeds: [p.agent as PlayCode], event: false, fact: FIT_FACT_IDS.has(`${p.agent}.${sid}`) })),
  ),
  ...(data.events as unknown as RawEvent[]).map((e) => ({ id: e.id, name: e.name, find: e.find, freq: e.freq as Frequency, kind: e.kind as SignalKind, feeds: e.feeds as PlayCode[], event: true, fact: FIT_FACT_IDS.has(e.id) })),
];

const BY_ID = new Map(SIGNALS.map((s) => [s.id, s]));
export const signalDef = (id: string): SignalDef | undefined => BY_ID.get(id.toUpperCase());

/** A signal ID as written in the Sheet: A1.S1, E2 (lower case and spaces tolerated). */
export const SIGNAL_ID_RE = /\b(A[123]\s?\.\s?S[1-8]|E[1-8])\b/i;
export const normalizeSignalId = (raw: string): string => raw.replace(/\s+/g, "").toUpperCase();
