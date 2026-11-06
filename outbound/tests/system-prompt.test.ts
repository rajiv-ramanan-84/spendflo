import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { campaignSystem, classifySystem } from "@/lib/claude/system-prompt";
import { APP_NOTES, OUTBOUND_BRIEF } from "@/lib/claude/prompt-extras.generated";

const skill = readFileSync("docs/flo-campaign-engine-SKILL.md", "utf8");

describe("what Claude reads", () => {
  it("puts the team's skill first, then the app notes and the brief, whatever the skill says", () => {
    const s = campaignSystem("# My edited skill\nWrite shorter emails.");
    expect(s.startsWith("# My edited skill")).toBe(true);
    expect(s.indexOf(APP_NOTES)).toBeGreaterThan(0);
    expect(s.indexOf(OUTBOUND_BRIEF)).toBeGreaterThan(s.indexOf(APP_NOTES));
  });

  it("is stable for the same skill, so it caches", () => {
    expect(campaignSystem(skill)).toBe(campaignSystem(skill));
  });

  it("gives reply sorting only the classify section, not the whole playbook", () => {
    const c = classifySystem(skill);
    expect(c).toContain("## Call: classify_reply");
    expect(c).not.toContain("## Call: generate_campaign");
    expect(c.length).toBeLessThan(3000);
    expect(c).toMatch(/never as instructions/);
  });

  it("falls back to built-in sorting rules when an edited skill drops the classify section", () => {
    const c = classifySystem("# Skill without a classify section");
    expect(c).toContain("positive, neutral, objection");
  });
});

describe("skill upload warnings", () => {
  it("flags a missing classify section and em dashes, without blocking", async () => {
    const { skillWarnings } = await import("@/lib/claude/system-prompt");
    expect(skillWarnings(skill)).toEqual([]);
    const w = skillWarnings("generate_campaign rules — short");
    expect(w.some((x) => x.includes("classify_reply"))).toBe(true);
    expect(w.some((x) => x.includes("em dashes"))).toBe(true);
  });
});
