import { describe, expect, it } from "vitest";
import { DEFAULT_HYPOTHESES, FOUNDER_STYLE, isFounderSignature, pickHypothesis, validationFocus } from "@/lib/playbook/founder";
import { kitFor } from "@/lib/playbook/kit";
import { campaignSystem } from "@/lib/claude/system-prompt";
import { requestParams } from "@/lib/claude/call";
import { CampaignSchema } from "@/lib/claude/schemas";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

describe("who gets the founder style", () => {
  it("reads it from the signature, so Settings controls it", () => {
    expect(isFounderSignature("Rajiv\nCo-founder, Spendflo")).toBe(true);
    expect(isFounderSignature("Sid\nCo-Founder, Spendflo")).toBe(true);
    expect(isFounderSignature("Mouli\nGlobal Head, Business Development, Spendflo")).toBe(false);
    expect(isFounderSignature("")).toBe(false);
    expect(isFounderSignature(null)).toBe(false);
  });
});

describe("the app picks the hypothesis", () => {
  it("has the approved lines for the key cells", () => {
    expect(pickHypothesis("A1", "procurement_leader")?.h.guess).toMatch(/contract turnaround but don't control legal's queue/);
    expect(pickHypothesis("A3", "system_owner")?.h.guess).toMatch(/requisitions still need manual fixing/);
    expect(pickHypothesis("A2", "economic_buyer")?.h.guess).toMatch(/notice window closes first/);
    expect(pickHypothesis("A3", "procurement_leader")?.h.guess).toMatch(/spend under management/);
    expect(pickHypothesis("A3", "finance_ap")?.h.guess).toMatch(/same software gets bought more than once/);
  });
  it("never uses the shallow angles", () => {
    const all = Object.values(DEFAULT_HYPOTHESES).map((x) => `${x.guess} ${x.share} ${x.subject}`).join(" ").toLowerCase();
    expect(all).not.toMatch(/catalog adoption|how do i buy|how to buy/);
  });
  it("uses an edited line over the default", () => {
    const custom = { "A1:procurement_leader": { guess: "my line", share: "my share", subject: "My subject" } };
    const p = pickHypothesis("A1", "procurement_leader", custom);
    expect(p?.h.guess).toBe("my line");
    expect(p?.edited).toBe(true);
  });
  it("falls back to the who-owns-this line, and to nothing for an unmapped persona", () => {
    expect(pickHypothesis("A1", "finance_ap")?.key).toBe("A1:champion");
    expect(pickHypothesis(null, "procurement_leader")).toBeNull();
  });
  it("fills the company name and asks for 20 minutes", () => {
    const f = validationFocus({ play: "A2", persona: "economic_buyer", companyName: "Acme" });
    expect(f?.hypothesis).toContain("Acme");
    expect(f?.ask).toMatch(/20 minutes/);
    expect(f?.subject_idea).not.toMatch(/\{company\}/);
  });
  it("composes the group line for the persona and drops it when the setting is off", () => {
    const f = validationFocus({ play: "A2", persona: "economic_buyer", companyName: "Acme", smallGroup: true });
    expect(f?.group_line).toBe("I'm speaking with a small group of enterprise finance and procurement executives about renewals signed at the vendor's price, and I'd value your view at Acme.");
    expect(validationFocus({ play: "A2", persona: "economic_buyer", companyName: "Acme", smallGroup: false })?.group_line).toBeUndefined();
    expect(validationFocus({ play: "A1", persona: "procurement_leader", companyName: "Acme", smallGroup: true })?.group_line).toContain("about contract turnaround,");
  });
  it("every default has the three parts and no customer names or numbers", () => {
    for (const [k, v] of Object.entries(DEFAULT_HYPOTHESES)) {
      expect(v.guess.length, k).toBeGreaterThan(20);
      expect(v.share.length, k).toBeGreaterThan(10);
      expect(v.subject.split(" ").length, k).toBeLessThanOrEqual(8);
      expect(`${v.guess} ${v.share}`, k).not.toMatch(/\d{2,}|\d%|\$/);
    }
  });
});

describe("the prompt switches style", () => {
  const skill = "Skill text. ## Call: classify_reply\nx";
  it("adds the founder section and drops the pitch for founder emails", () => {
    const sys = campaignSystem(skill, "A1", "founder");
    expect(sys).toContain("# FOUNDER VALIDATION STYLE");
    expect(sys).not.toContain("## Value proposition");
    expect(sys).not.toContain("## The 30-day proof");
    expect(sys).not.toMatch(/Email pattern, /);
  });
  it("leaves the standard style exactly as it was", () => {
    const sys = campaignSystem(skill, "A1");
    expect(sys).not.toContain("# FOUNDER VALIDATION STYLE");
    expect(sys).toMatch(/Email pattern, /);
    expect(kitFor("A1")).toBe(kitFor("A1", "standard"));
  });
  it("picks the style from the request, not from a setting someone has to remember", () => {
    const fmt = zodOutputFormat(CampaignSchema);
    const f = requestParams("generate_campaign", "claude-sonnet-5-5", skill, { outreach_style: "founder" }, fmt, "A1");
    const s = requestParams("generate_campaign", "claude-sonnet-5-5", skill, { outreach_style: "standard" }, fmt, "A1");
    expect(f.system[0].text).toContain("# FOUNDER VALIDATION STYLE");
    expect(s.system[0].text).not.toContain("# FOUNDER VALIDATION STYLE");
  });
  it("the style text has no em dashes and asks for exactly 20 minutes", () => {
    expect(FOUNDER_STYLE).not.toContain("—");
    expect(FOUNDER_STYLE).toMatch(/20 minutes/);
  });
});
