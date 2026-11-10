/**
 * Focus Today priority (PRD owner view 1). Pure. Score 0 to 100 with the
 * reasons that earned it, so every card can say why it is there.
 */

export type PriorityWeights = {
  reply_waiting: number;
  overdue: number;
  due_today: number;
  level_super_hot: number;
  level_hot: number;
  level_warm: number;
  tier_a: number;
  tier_b: number;
  tier_c: number;
  warm_accepted: number;
  new_trigger: number;
  not_started: number;
  going_cold: number;
};

export const DEFAULT_WEIGHTS: PriorityWeights = {
  reply_waiting: 40,
  overdue: 20,
  due_today: 15,
  // Timing leads: a signal is the reason to work an account today. Tier only breaks ties.
  level_super_hot: 45,
  level_hot: 35,
  level_warm: 20,
  tier_a: 8,
  tier_b: 5,
  tier_c: 2,
  warm_accepted: 10,
  new_trigger: 10,
  not_started: 10,
  going_cold: 5,
};

export type PriorityInput = {
  tier: string | null;
  /** Super hot, hot, warm, nurture or not_fit. Left out, an account counts as live. */
  level?: string | null;
  replyWaiting: boolean; // a confirmed or pending response not yet re-planned
  hasOverdue: boolean;
  hasDueToday: boolean;
  warmAccepted: boolean; // LinkedIn accept in the last 3 days, no follow-up done since
  newTrigger: boolean; // trigger dated within the last 14 days
  workingDaysAssignedWithoutLaunch: number | null; // null when a campaign is live
  daysSinceLastTouch: number | null; // null when nothing is live
  pinned: boolean;
};

export type Reason = "Reply waiting" | "Overdue" | "Due today" | "Super hot" | "Hot" | "Warm" | "Tier A" | "Tier B" | "Tier C" | "Warm: accepted" | "New trigger" | "Not started" | "Going cold" | "Pinned";

const LIVE_LEVELS = ["super_hot", "hot", "warm"];

/** Why an account earns a place on Focus Today. Tier alone never does: a good account with no reason to call is not today's focus. */
export function isFocusWorthy(reasons: string[], pinned: boolean): boolean {
  return pinned || reasons.some((r) => ["Reply waiting", "Overdue", "Due today", "Super hot", "Hot", "Warm", "Warm: accepted", "Going cold"].includes(r));
}

export function priorityScore(i: PriorityInput, w: PriorityWeights = DEFAULT_WEIGHTS): { score: number; reasons: Reason[] } {
  const parts: Array<[boolean, number, Reason]> = [
    [i.replyWaiting, w.reply_waiting, "Reply waiting"],
    [i.hasOverdue, w.overdue, "Overdue"],
    [i.hasDueToday, w.due_today, "Due today"],
    [i.level === "super_hot", w.level_super_hot, "Super hot"],
    [i.level === "hot", w.level_hot, "Hot"],
    [i.level === "warm", w.level_warm, "Warm"],
    [i.tier === "A", w.tier_a, "Tier A"],
    [i.tier === "B", w.tier_b, "Tier B"],
    [i.tier === "C", w.tier_c, "Tier C"],
    [i.warmAccepted, w.warm_accepted, "Warm: accepted"],
    [i.newTrigger, w.new_trigger, "New trigger"],
    [i.workingDaysAssignedWithoutLaunch !== null && i.workingDaysAssignedWithoutLaunch >= 2 && (i.level == null || LIVE_LEVELS.includes(i.level)), w.not_started, "Not started"],
    [i.daysSinceLastTouch !== null && i.daysSinceLastTouch >= 10, w.going_cold, "Going cold"],
  ];
  let score = 0;
  const reasons: Reason[] = [];
  for (const [hit, pts, label] of parts) {
    if (!hit) continue;
    score += pts;
    reasons.push(label);
  }
  if (i.pinned) reasons.unshift("Pinned");
  return { score: Math.min(100, Math.max(0, score)), reasons };
}

/** Focus Today order: pinned first, then score, then tier. */
export function focusOrder<T extends { pinned: boolean; score: number; tier: string | null; name: string }>(xs: T[], limit = 10): T[] {
  const tierRank = (t: string | null) => ({ A: 0, B: 1, C: 2, D: 3 })[t as "A"] ?? 4;
  return [...xs]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score || tierRank(a.tier) - tierRank(b.tier) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
