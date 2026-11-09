import type { IsoDate } from "@/lib/calendar/dates";
import type { PayloadPlay, PayloadSignal } from "@/lib/claude/payload";
import { PLAY_JOB, PLAY_NAME } from "./catalog";
import { AGING_DAYS, evaluatePlay, type PlayResult } from "./gate";
import { parseSignals } from "./signals";

/** What Claude is told about an account's signals and the play they earned. Pure. */
export function playForAccount(a: { signals: string | null; outreach_angle: string | null; archived?: boolean | null; icp_verdict?: string | null; do_not_contact?: boolean | null }, today: IsoDate): PlayResult {
  return evaluatePlay({
    signals: parseSignals(a.signals),
    today,
    angleNote: a.outreach_angle,
    notFit: !!a.archived || !!a.do_not_contact || a.icp_verdict === "no_fit",
  });
}

export function playPayload(r: PlayResult): { play: PayloadPlay | null; signals: PayloadSignal[] } {
  const row = (s: PlayResult["fresh"][number], counts: boolean, why?: string): PayloadSignal => ({
    id: s.id, name: s.name, type: s.kind, seen_on: s.seenOn, age_days: s.ageDays, counts, ...(why ? { why_not: why } : {}),
    confidence: s.confidence, evidence: s.evidence, source: s.url,
  });
  const signals = [
    ...r.fresh.map((s) => row(s, true)),
    ...r.aging.map((s) => ({ ...row(s, true), note: `${s.ageDays} days old: counts toward Hot, weaker than a fresh signal` })),
    ...r.stale.map((s) => row(s, false, `older than ${AGING_DAYS} days: history, not a trigger`)),
    ...r.facts.map((s) => row(s, false, "a fit fact (size or team), not a trigger")),
    ...r.ignored.map((s) => row(s, false, s.expired ? "expired" : s.ageDays === null ? "undated" : s.plays.length ? "date is in the future" : "not on the signal list")),
  ];
  const code = r.play ?? r.pointsTo;
  return {
    signals,
    play: code ? { code, job: PLAY_JOB[code], name: PLAY_NAME[code], level: r.level, why: r.reasons, points_to: r.play ? null : r.pointsTo } : null,
  };
}
