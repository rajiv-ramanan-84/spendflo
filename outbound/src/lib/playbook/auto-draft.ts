export type AutoDraftMode = "off" | "a" | "ab";

/**
 * Who is drafted overnight. Timing leads: Super hot and Hot accounts are always drafted, whatever
 * their tier, because a signal is the reason to write. Warm accounts follow the Settings switch
 * (Tier A, or Tier A and B). Nurture accounts are never drafted.
 */
export function shouldAutoDraft(a: { mode: AutoDraftMode; level: string; tier: string | null }): boolean {
  if (a.mode === "off") return false;
  if (a.level === "super_hot" || a.level === "hot") return true;
  if (a.level === "warm") return a.tier === "A" || (a.mode === "ab" && a.tier === "B");
  return false;
}
