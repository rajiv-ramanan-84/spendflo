import { describe, expect, it } from "vitest";
import { GROUPS, LEGACY_HASH, NAV, SEARCH_EXTRAS, canSee, navById, navForPath, searchSettings, visibleNav } from "@/lib/settings/nav";
import { buildTiles, needsAttention, type HealthInputs } from "@/lib/settings/health";

describe("settings navigation", () => {
  it("has unique ids and addresses, and every group exists", () => {
    expect(new Set(NAV.map((n) => n.id)).size).toBe(NAV.length);
    expect(new Set(NAV.map((n) => n.href)).size).toBe(NAV.length);
    for (const n of NAV) expect(GROUPS.some((g) => g.id === n.group)).toBe(true);
  });
  it("shows each role only what it may open", () => {
    const ids = (r: "admin" | "manager" | "member") => visibleNav(r).map((n) => n.id);
    expect(ids("member")).toEqual(["overview", "me", "rules", "traces"]);
    expect(ids("manager")).not.toContain("backup");
    expect(ids("manager")).toContain("sync");
    expect(ids("admin")).toHaveLength(NAV.length);
    expect(canSee("member", "admin")).toBe(false);
  });
  it("sends every old #link to a real page", () => {
    for (const to of Object.values(LEGACY_HASH)) expect(navForPath(to)).not.toBeNull();
  });
  it("points every search entry at a real page", () => {
    for (const e of SEARCH_EXTRAS) expect(navById(e.to), e.label).toBeDefined();
  });
});

describe("find a setting", () => {
  it("finds a setting by what people call it", () => {
    expect(searchSettings("tapistro credits", "admin")[0].href).toBe("/settings/ai/assistant");
    expect(searchSettings("signature", "member")[0].href).toBe("/settings/writing/rules");
    expect(searchSettings("backup", "admin")[0].href).toBe("/settings/data/backup");
  });
  it("never offers a page the person cannot open", () => {
    expect(searchSettings("backup", "member")).toEqual([]);
    expect(searchSettings("kill switch", "member")).toEqual([]);
    expect(searchSettings("   ", "admin")).toEqual([]);
  });
});

const base: HealthInputs = {
  me: { gmail: "ok", slackSet: true, signatureSet: true, mailbox: { shared: false, email: null, status: null } },
  sync: { status: "ok", agoMin: 20, rows: 0 }, slack: { connected: true, channel: true }, feed: { configured: true, error: null },
  linkedin: { lastAgoHours: 3, unmatched: 0 }, assistant: { enabled: true, usd: 1, usdCap: 50, credits: 10, creditCap: 500, warnPct: 80 },
  drafting: { spent: 5, budget: 50 }, integrations: { enabled: 1, failing: 0, toReview: 0 }, team: { expiredGmail: 0 },
};

describe("health tiles", () => {
  it("is quiet when everything is fine", () => {
    expect(needsAttention(buildTiles(base))).toEqual([]);
  });
  it("puts the worst problem first and says where to fix it", () => {
    const tiles = buildTiles({ ...base, sync: { status: "failed", agoMin: 120, rows: 3 }, assistant: { ...base.assistant, usd: 41 }, me: { ...base.me, signatureSet: false } });
    const a = needsAttention(tiles);
    expect(a[0].id).toBe("sync");
    expect(a[0].href).toBe("/settings/data/sync");
    expect(a.map((x) => x.id)).toEqual(expect.arrayContaining(["assistant", "signature"]));
  });
  it("treats a switched-off assistant as off, not as a problem", () => {
    const t = buildTiles({ ...base, assistant: { ...base.assistant, enabled: false } }).find((x) => x.id === "assistant")!;
    expect(t.tone).toBe("off");
  });
  it("flags a reached limit as bad", () => {
    expect(buildTiles({ ...base, assistant: { ...base.assistant, credits: 500 } }).find((x) => x.id === "assistant")!.tone).toBe("bad");
    expect(buildTiles({ ...base, drafting: { spent: 50, budget: 50 } }).find((x) => x.id === "drafting")!.tone).toBe("bad");
  });
});
