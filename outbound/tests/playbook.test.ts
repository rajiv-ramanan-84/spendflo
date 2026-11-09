import { describe, expect, it } from "vitest";
import data from "@/lib/playbook/playbook.json";
import { SIGNALS, signalDef, PLAY_JOB } from "@/lib/playbook/catalog";
import { parseSignals } from "@/lib/playbook/signals";
import { angleToPlay, evaluatePlay, FRESH_DAYS } from "@/lib/playbook/gate";
import { kitFor } from "@/lib/playbook/kit";
import { playForAccount, playPayload } from "@/lib/playbook/payload";
import { campaignSystem } from "@/lib/claude/system-prompt";

const TODAY = "2026-11-09";
const line = (id: string, date: string, ev = "Hiring Contract Manager", extra = "https://example.com/x | Confirmed") => `${id} | ${date} | ${ev} | ${extra}`;

describe("catalog", () => {
  it("has 24 play signals and 8 account events, each play fed by 8 of its own", () => {
    expect(SIGNALS).toHaveLength(32);
    expect(SIGNALS.filter((s) => !s.event)).toHaveLength(24);
    expect(signalDef("a1.s1")?.name).toBe("Contract hiring");
    expect(signalDef("E7")?.feeds).toEqual(["A1", "A2", "A3"]);
    expect(PLAY_JOB.A3).toBe("guided_buying");
  });
});

describe("parseSignals", () => {
  it("reads one line per signal with a date, evidence, link and confidence", () => {
    const s = parseSignals([line("A1.S1", "2026-11-03"), line("E2", "2026-10-21", "New CFO named", "https://example.com/p | Likely"), "A3.S4 | Undated | off-catalog buying named | | Likely"].join("\n"));
    expect(s.map((x) => [x.id, x.seenOn, x.confidence, x.undated])).toEqual([["A1.S1", "2026-11-03", "confirmed", false], ["E2", "2026-10-21", "likely", false], ["A3.S4", null, "likely", true]]);
    expect(s[0].url).toBe("https://example.com/x");
  });
  it("marks expired posts and counts the same line once", () => {
    const s = parseSignals([line("A1.S1", "2026-11-03", "Job post (expired)"), line("A1.S1", "2026-11-03", "Job post (expired)")].join("\n"));
    expect(s).toHaveLength(1);
    expect(s[0].expired).toBe(true);
  });
  it("still understands the free text the Sheet had before the format", () => {
    const s = parseSignals("A3.S6: ~15K employees est, medtech; Indirect Procurement Ops Manager job asks to advance Coupa skills (themuse.com, 2025-11-13)");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: "A3.S6", seenOn: "2025-11-13", legacy: true });
  });
  it("reads the research agent's real style: combined IDs, month-only dates, 'undated'", () => {
    const s = parseSignals("A1.S7/A2.S2: voluntary buyouts for ~61K staff (bloomberg.com, 2026-06); A1.S5: Kimberly-Clark Kenvue acquisition (2025-11-04, closing 2026); A1.S3: Procurement transformation (levelpath.com, 2026, undated); A2.S3: Sourcing role (themuse.com, Dec 2025)");
    expect(s.map((x) => [x.id, x.seenOn])).toEqual([["A1.S7", "2026-06-01"], ["A2.S2", "2026-06-01"], ["A1.S5", "2025-11-04"], ["A1.S3", null], ["A2.S3", "2025-12-01"]]);
  });
  it("keeps untagged text but never counts it", () => {
    const s = parseSignals("Coupa admin seen on LinkedIn");
    expect(s[0]).toMatchObject({ id: "UNTAGGED", undated: true });
    expect(parseSignals("")).toEqual([]);
  });
});

describe("the gate", () => {
  const ev = (lines: string[], extra: Partial<Parameters<typeof evaluatePlay>[0]> = {}) => evaluatePlay({ signals: parseSignals(lines.join("\n")), today: TODAY, ...extra });

  it("is Hot with two different signals in 90 days, Warm with one, Nurture with none", () => {
    expect(ev([line("A1.S1", "2026-11-03"), line("A1.S5", "2026-10-01", "Acquisition")])).toMatchObject({ level: "hot", play: "A1", job: "redlining" });
    expect(ev([line("A1.S1", "2026-11-03")])).toMatchObject({ level: "warm", play: "A1" });
    expect(ev([])).toMatchObject({ level: "nurture", play: null });
  });
  it("counts day 90 and drops day 91", () => {
    expect(ev([line("A2.S1", "2026-08-11")]).level).toBe("warm");
    expect(ev([line("A2.S1", "2026-08-10")]).level).toBe("nurture");
    expect(FRESH_DAYS).toBe(90);
  });
  it("counts each different signal once, and a repeat of the same ID never makes it Hot", () => {
    expect(ev([line("A1.S1", "2026-11-03", "Role one"), line("A1.S1", "2026-11-05", "Role two")]).level).toBe("warm");
  });
  it("never counts undated, expired, future or unlisted signals", () => {
    const r = ev(["A1.S1 | Undated | x | | Likely", line("A1.S2", "2026-11-01", "Post (expired)"), line("A1.S3", "2027-01-01"), "NEW | 2026-11-01 | something new | |"]);
    expect(r.level).toBe("nurture");
    expect(r.ignored).toHaveLength(4);
  });
  it("lets account events count for the plays they feed", () => {
    expect(ev([line("E1", "2026-10-20", "PE buyout"), line("E2", "2026-10-25", "New CFO")])).toMatchObject({ level: "hot", play: "A2" });
    expect(ev([line("E4", "2026-10-20", "ERP finished")])).toMatchObject({ level: "warm", play: "A1" });
  });
  it("picks the play with the most direct signals, then the most signals, then the owner's note, then the plays' order", () => {
    // A3 has two direct signals; A1 has two context signals.
    expect(ev([line("A3.S1", "2026-11-01"), line("A3.S3", "2026-11-02"), line("A1.S3", "2026-11-01"), line("A1.S5", "2026-11-01")]).play).toBe("A3");
    // E7 is direct and feeds every play, so the owner's note decides.
    expect(ev([line("E7", "2026-11-01", "Intent")], { angleNote: "Lead with renewals" }).play).toBe("A2");
    expect(ev([line("E7", "2026-11-01", "Intent")]).play).toBe("A1");
    expect(angleToPlay("guided buying and catalog adoption")).toBe("A3");
  });
  it("says Not a fit before anything else", () => {
    expect(ev([line("A1.S1", "2026-11-03")], { notFit: true })).toMatchObject({ level: "not_fit", play: null });
  });
  it("puts an account with only an old signal in Nurture and says which play it pointed to", () => {
    const r = playForAccount({ signals: "A1.S1: Hiring a contract manager (themuse.com, 2025-11-13)", outreach_angle: null }, TODAY);
    expect(r.level).toBe("nurture");
    expect(r.pointsTo).toBe("A1");
    expect(r.reasons[0]).toMatch(/No signal in the last 90 days/);
  });
  it("never counts a fit fact like 15K employees, however fresh (the Intuitive case)", () => {
    const r = ev([line("A3.S6", "2026-11-05", "~15K employees, medtech")]);
    expect(r.level).toBe("nurture");
    expect(r.facts).toHaveLength(1);
    expect(r.pointsTo).toBe("A3");
    expect(ev([line("A3.S6", "2026-11-05", "~15K employees"), line("A3.S1", "2026-11-04", "Catalog steward role")])).toMatchObject({ level: "warm", play: "A3" });
  });
});

describe("what Claude is told", () => {
  it("marks which signals count and why the others don't", () => {
    const r = playForAccount({ signals: [line("A1.S1", "2026-11-03"), line("A1.S2", "2026-01-01", "Old"), "A1.S4 | Undated | x | |"].join("\n"), outreach_angle: null }, TODAY);
    const { play, signals } = playPayload(r);
    expect(play).toMatchObject({ code: "A1", job: "redlining", level: "warm" });
    expect(signals.map((s) => [s.id, s.counts, s.why_not ?? null])).toEqual([["A1.S1", true, null], ["A1.S2", false, "older than 90 days: history, not a trigger"], ["A1.S4", false, "undated"]]);
  });
  it("adds only the matched play's kit to the system prompt", () => {
    const sys = campaignSystem("SKILL TEXT", "A3");
    expect(sys).toContain("PLAYBOOK: Guided buying (A3)");
    expect(sys).not.toContain("PLAYBOOK: Contract review and redlining (A1)");
    expect(campaignSystem("SKILL TEXT", "all")).toContain("PLAYBOOK: Renewal intelligence (A2)");
    expect(campaignSystem("SKILL TEXT", null)).not.toContain("PLAYBOOK:");
  });
});

describe("playbook kits", () => {
  it("exist for every play, carry the guided buying value proposition, and have no em dashes", () => {
    for (const c of ["A1", "A2", "A3"] as const) {
      const k = kitFor(c);
      expect(k.length).toBeGreaterThan(3000);
      expect(k).not.toContain("—");
    }
    expect(kitFor("A3")).toContain("Make the right way to buy the easy way");
    expect(kitFor("A3")).toContain("Off-contract spend redirected");
  });
  it("keeps every example email under 100 words and every connect note under 300 characters", () => {
    for (const p of data.plays as Array<{ emails: Array<{ body: string }>; li: { connect: string } }>) {
      for (const e of p.emails) expect(e.body.trim().split(/\s+/).length, e.body.slice(0, 40)).toBeLessThan(100);
      expect(p.li.connect.length).toBeLessThan(300);
    }
  });
});
