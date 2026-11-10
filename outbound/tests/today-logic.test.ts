import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, focusOrder, isFocusWorthy, priorityScore, type PriorityInput } from "@/lib/priority/score";
import { hasUnresolvedToken, resolveTokens, tokenContext } from "@/lib/copy-tokens";
import { buildDraftMime, gmailDraftLink, toBase64Url } from "@/lib/google/mime";

const base: PriorityInput = {
  tier: "C", replyWaiting: false, hasOverdue: false, hasDueToday: false, warmAccepted: false,
  newTrigger: false, workingDaysAssignedWithoutLaunch: null, daysSinceLastTouch: null, pinned: false,
};

describe("priority score", () => {
  it("adds the PRD weights and lists each reason", () => {
    expect(priorityScore({ ...base, tier: "A", replyWaiting: true, hasDueToday: true })).toEqual({ score: 63, reasons: ["Reply waiting", "Due today", "Tier A"] });
  });

  it("caps at 100", () => {
    const s = priorityScore({ ...base, tier: "A", replyWaiting: true, hasOverdue: true, hasDueToday: true, warmAccepted: true, newTrigger: true });
    expect(s.score).toBe(100);
  });

  it("flags not started after 2 working days and going cold after 10 days", () => {
    expect(priorityScore({ ...base, workingDaysAssignedWithoutLaunch: 1 }).reasons).not.toContain("Not started");
    expect(priorityScore({ ...base, workingDaysAssignedWithoutLaunch: 2 }).reasons).toContain("Not started");
    expect(priorityScore({ ...base, daysSinceLastTouch: 9 }).reasons).not.toContain("Going cold");
    expect(priorityScore({ ...base, daysSinceLastTouch: 10 })).toEqual({ score: 7, reasons: ["Tier C", "Going cold"] });
  });

  it("uses weights from Settings", () => {
    expect(priorityScore({ ...base, tier: "A" }, { ...DEFAULT_WEIGHTS, tier_a: 50 }).score).toBe(50);
  });

  it("puts pinned accounts first, then score, then tier", () => {
    const xs = [
      { name: "b", score: 90, tier: "B", pinned: false },
      { name: "a", score: 30, tier: "C", pinned: true },
      { name: "c", score: 90, tier: "A", pinned: false },
    ];
    expect(focusOrder(xs).map((x) => x.name)).toEqual(["a", "c", "b"]);
    expect(focusOrder(xs, 2)).toHaveLength(2);
  });
});

describe("personalisation tokens", () => {
  const ctx = tokenContext({ full_name: "Patrick Vestergaard", title: "Director of Indirect Sourcing" }, "Ahold Delhaize USA", "Chandramouli S");

  it("resolves known tokens in either style", () => {
    expect(resolveTokens("Hi {first_name}, {Company} team. [Title]. - {sender}", ctx)).toBe("Hi Patrick, Ahold Delhaize USA team. Director of Indirect Sourcing. - Chandramouli");
  });

  it("leaves unknown tokens so the send is blocked", () => {
    const out = resolveTokens("Hi {nickname}", ctx);
    expect(out).toBe("Hi {nickname}");
    expect(hasUnresolvedToken(out)).toBe(true);
    expect(hasUnresolvedToken("No tokens here")).toBe(false);
  });
});

describe("Gmail draft MIME", () => {
  const mime = buildDraftMime({ from: "chandramouli@spendflo.com", to: "patrick@aholddelhaize.com", toName: "Patrick Vestergaard", subject: "notice periods on indirect", body: "Patrick,\nShort note.\n\nMouli" });

  it("carries the edited body exactly, base64 encoded", () => {
    const [, b64] = mime.split("\r\n\r\n");
    expect(Buffer.from(b64.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("Patrick,\r\nShort note.\r\n\r\nMouli");
    expect(mime).toContain("To: Patrick Vestergaard <patrick@aholddelhaize.com>");
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
  });

  it("encodes non-ASCII headers and strips header injection", () => {
    const m = buildDraftMime({ from: "a@spendflo.com", to: "x@y.com\r\nBcc: evil@z.com", subject: "Renewals – José", body: "b" });
    expect(m).not.toMatch(/\r\nBcc:/);
    expect(m).toMatch(/Subject: =\?UTF-8\?B\?/);
  });

  it("is URL-safe base64 for the API and links to the sender's drafts", () => {
    expect(toBase64Url(mime)).not.toMatch(/[+/=]/);
    expect(gmailDraftLink("chandramouli@spendflo.com", "r-123")).toBe("https://mail.google.com/mail/?authuser=chandramouli%40spendflo.com#drafts?compose=r-123");
  });
});

describe("timing leads, tier only breaks ties", () => {
  it("ranks a Warm Tier C account above a Tier A account with no signal", () => {
    const warmC = priorityScore({ ...base, tier: "C", level: "warm" });
    const nurtureA = priorityScore({ ...base, tier: "A", level: "nurture" });
    expect(warmC.score).toBeGreaterThan(nurtureA.score);
    expect(warmC.reasons).toEqual(["Warm", "Tier C"]);
  });
  it("super hot and hot outrank everything a tier can add", () => {
    expect(priorityScore({ ...base, tier: "C", level: "hot" }).score).toBeGreaterThan(priorityScore({ ...base, tier: "A", level: "warm" }).score);
    expect(priorityScore({ ...base, tier: "C", level: "super_hot" }).score).toBeGreaterThan(priorityScore({ ...base, tier: "A", level: "hot" }).score);
  });
  it("does not call a Nurture account Not started", () => {
    expect(priorityScore({ ...base, tier: "A", level: "nurture", workingDaysAssignedWithoutLaunch: 5 }).reasons).toEqual(["Tier A"]);
    expect(priorityScore({ ...base, tier: "A", level: "hot", workingDaysAssignedWithoutLaunch: 5 }).reasons).toContain("Not started");
  });
  it("keeps tier-only accounts out of Focus Today", () => {
    expect(isFocusWorthy(["Tier A"], false)).toBe(false);
    expect(isFocusWorthy(["Tier A", "Not started"], false)).toBe(false);
    expect(isFocusWorthy(["Hot", "Tier B"], false)).toBe(true);
    expect(isFocusWorthy(["Reply waiting"], false)).toBe(true);
    expect(isFocusWorthy(["Tier C"], true)).toBe(true);
  });
});
