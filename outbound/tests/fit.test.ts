import { describe, expect, it } from "vitest";
import { evaluateFit, fitForPlay, headcount, researcherPlays, type FitInput } from "@/lib/playbook/fit";
import { shouldAutoDraft } from "@/lib/playbook/auto-draft";

const base: FitInput = { coupaEvidence: "Current Coupa admin on LinkedIn (per Mouli). Research: Coupa case study", employees: "~13,000 (est.)", disqualifierFlags: null, researchFit: "Agent 1, Agent 3", personas: ["procurement_leader", "system_owner"], liveSignalIds: [] };

describe("headcount", () => {
  it("reads the numbers people type", () => {
    expect(headcount("~13,000 (est.)")).toBe(13000);
    expect(headcount("approx 7.5K (SN 7.5K+)")).toBe(7500);
    expect(headcount("unverified; LinkedIn 86K+; corporate headcount much smaller")).toBe(86000);
    expect(headcount("128 (LinkedIn)")).toBe(128);
    expect(headcount("unverified")).toBeNull();
    expect(headcount(null)).toBeNull();
  });
});

describe("researcher marks", () => {
  it("parses every shape in the Sheet", () => {
    expect(researcherPlays("Agent 1, Agent 2")).toEqual(["A1", "A2"]);
    expect(researcherPlays("2,3")).toEqual(["A2", "A3"]);
    expect(researcherPlays("None")).toEqual([]);
    expect(researcherPlays("none")).toEqual([]);
    expect(researcherPlays("")).toBeNull();
    expect(researcherPlays(null)).toBeNull();
  });
});

describe("fit per play", () => {
  it("is strong when Coupa, a leader, an admin, scale and the researcher agree", () => {
    const r = evaluateFit(base);
    expect(r.plays.find((p) => p.play === "A3")!.level).toBe("strong");
    expect(r.level).toBe("strong");
    expect(["A1", "A3"]).toContain(r.best);
  });
  it("cannot be strong while most of the ICP is still unknown", () => {
    const a2 = fitForPlay("A2", base);
    expect(a2.unknown).toBeGreaterThan(2);
    expect(a2.level).toBe("possible");
  });
  it("never counts unknown checks against an account", () => {
    const a2 = fitForPlay("A2", base);
    expect(a2.unknown).toBeGreaterThanOrEqual(3);
    expect(a2.checks.filter((c) => c.status === "unknown").every((c) => c.note.length > 0)).toBe(true);
  });
  it("is weak without Coupa, whatever else is true", () => {
    const r = evaluateFit({ ...base, coupaEvidence: "Research: No Coupa evidence found" });
    expect(r.level).toBe("weak");
    expect(r.best).toBeNull();
  });
  it("is weak when a team gate is missed", () => {
    const r = evaluateFit({ ...base, disqualifierFlags: "Revenue gate miss (>15B)" });
    expect(r.level).toBe("weak");
  });
  it("treats a possible gate miss as partial, not a failure", () => {
    const a1 = fitForPlay("A1", { ...base, disqualifierFlags: "Possible: Revenue gate miss (<500M, est unverified)" });
    expect(a1.checks.find((c) => c.id === "gates")!.status).toBe("partial");
    expect(a1.level).not.toBe("weak");
  });
  it("guided buying needs scale: a 700 person company is not strong", () => {
    const a3 = fitForPlay("A3", { ...base, employees: "~771 (LinkedIn)" });
    expect(a3.checks.find((c) => c.id === "scale")!.status).toBe("unmet");
    expect(a3.level).not.toBe("strong");
  });
  it("a live rollout signal meets the new implementation check", () => {
    const a3 = fitForPlay("A3", { ...base, liveSignalIds: ["A3.S8"] });
    expect(a3.checks.find((c) => c.id === "s2p")!.status).toBe("met");
  });
  it("no contract manager is shown as unmet for redlining, not hidden", () => {
    const a1 = fitForPlay("A1", base);
    expect(a1.checks.find((c) => c.id === "contracts")!.status).toBe("unmet");
  });
});

describe("overnight drafts: timing leads, tier follows", () => {
  it("drafts Super hot and Hot in any tier once auto draft is on", () => {
    expect(shouldAutoDraft({ mode: "a", level: "super_hot", tier: "C" })).toBe(true);
    expect(shouldAutoDraft({ mode: "a", level: "hot", tier: null })).toBe(true);
  });
  it("drafts Warm only for the tiers in Settings", () => {
    expect(shouldAutoDraft({ mode: "a", level: "warm", tier: "A" })).toBe(true);
    expect(shouldAutoDraft({ mode: "a", level: "warm", tier: "B" })).toBe(false);
    expect(shouldAutoDraft({ mode: "ab", level: "warm", tier: "B" })).toBe(true);
    expect(shouldAutoDraft({ mode: "ab", level: "warm", tier: "C" })).toBe(false);
  });
  it("never drafts Nurture and never when off", () => {
    expect(shouldAutoDraft({ mode: "ab", level: "nurture", tier: "A" })).toBe(false);
    expect(shouldAutoDraft({ mode: "off", level: "super_hot", tier: "A" })).toBe(false);
  });
});
