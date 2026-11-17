import { describe, expect, it } from "vitest";
import {
  DEFAULT_SENDING, checkDomainDns, coreDomainSet, dayState, dkimState, dmarcState, domainFix, domainHealth, domainOf, effectiveMax, effectiveWarn,
  isConsumerDomain, isCoreAddress, istDayStartEpoch, sendState, shouldPauseForBounces, spfState, stateLine,
} from "@/lib/sending/rules";

const cfg = DEFAULT_SENDING;
const now = new Date("2026-11-19T06:00:00Z");

describe("daily limit and warning", () => {
  it("defaults to a warning above 25 and a maximum of 30", () => {
    expect(cfg.warnAt).toBe(25);
    expect(cfg.perAddressMax).toBe(30);
  });
  it("is quiet up to 25, warns on the 26th send, and stops at 30", () => {
    expect(sendState(24, 25, 30)).toBe("ok");
    expect(sendState(25, 25, 30)).toBe("warn"); // the next one would be the 26th
    expect(sendState(29, 25, 30)).toBe("warn");
    expect(sendState(30, 25, 30)).toBe("full");
  });
  it("describes the day so far: over 25 is amber, 30 is red", () => {
    expect(dayState(25, 25, 30)).toBe("ok");
    expect(dayState(26, 25, 30)).toBe("warn");
    expect(dayState(30, 25, 30)).toBe("full");
  });
  it("follows whatever numbers are configured", () => {
    expect(dayState(41, 40, 50)).toBe("warn");
    expect(sendState(49, 40, 50)).toBe("warn");
    expect(sendState(50, 40, 50)).toBe("full");
  });
  it("says it plainly", () => {
    expect(stateLine("a@b.com", 26, 25, 30)).toContain("Slow down");
    expect(stateLine("a@b.com", 30, 25, 30)).toContain("daily limit");
  });
});

describe("warm-up", () => {
  const mb = (daysAgo: number, established = false) => ({ established, startedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() });
  it("starts low and climbs, then reaches the full maximum", () => {
    expect(effectiveMax(cfg, mb(0), now)).toMatchObject({ max: 10, warming: true });
    expect(effectiveMax(cfg, mb(6), now)).toMatchObject({ max: 10, warming: true });
    expect(effectiveMax(cfg, mb(7), now)).toMatchObject({ max: 20, warming: true });
    expect(effectiveMax(cfg, mb(14), now)).toMatchObject({ max: 30, warming: false });
  });
  it("never warms an established inbox or a person's own Gmail", () => {
    expect(effectiveMax(cfg, mb(0, true), now).max).toBe(30);
    expect(effectiveMax(cfg, null, now).max).toBe(30);
  });
  it("can be switched off, and never goes above the maximum", () => {
    expect(effectiveMax({ ...cfg, warmupEnabled: false }, mb(0), now).max).toBe(30);
    expect(effectiveMax({ ...cfg, perAddressMax: 8 }, mb(0), now).max).toBe(8);
  });
  it("keeps the warning the same distance below a warm-up ceiling", () => {
    expect(effectiveWarn(cfg, 30)).toBe(25);
    expect(effectiveWarn(cfg, 10)).toBe(5);
    expect(effectiveWarn(cfg, 3)).toBe(1);
  });
});

describe("domains", () => {
  it("blocks personal inbox domains", () => {
    expect(isConsumerDomain("a@gmail.com")).toBe(true);
    expect(isConsumerDomain("a@Outlook.com")).toBe(true);
    expect(isConsumerDomain("a@spendflo-mail.com")).toBe(false);
  });
  it("treats the team's login domains and extras as core", () => {
    const core = coreDomainSet({ ...cfg, coreDomains: ["flo.ai"] }, ["rajiv@spendflo.com", "x@spendflo.com"]);
    expect(isCoreAddress("sid@spendflo.com", core)).toBe(true);
    expect(isCoreAddress("hi@flo.ai", core)).toBe(true);
    expect(isCoreAddress("m@spendflo-team.com", core)).toBe(false);
    expect(domainOf("A@B.com")).toBe("b.com");
  });
});

describe("bounce watch", () => {
  it("needs a real sample before pausing", () => {
    expect(shouldPauseForBounces(5, 2, 3, 20).pause).toBe(false);
    expect(shouldPauseForBounces(100, 2, 3, 20).pause).toBe(false);
    expect(shouldPauseForBounces(100, 3, 3, 20)).toEqual({ pause: true, rate: 3 });
    expect(shouldPauseForBounces(0, 0, 3, 20).pause).toBe(false);
  });
});

describe("dns records", () => {
  it("reads SPF", () => {
    expect(spfState([["v=spf1 include:_spf.google.com ~all"]])).toBe("pass");
    expect(spfState([["v=spf1 include:_spf.google.com -all"]])).toBe("pass");
    expect(spfState([["v=spf1 +all"]])).toBe("weak");
    expect(spfState([["v=spf1 include:x"]])).toBe("weak");
    expect(spfState([["google-site-verification=abc"]])).toBe("missing");
  });
  it("reads DMARC", () => {
    expect(dmarcState([["v=DMARC1; p=reject"]])).toBe("pass");
    expect(dmarcState([["v=DMARC1; p=quarantine; rua=mailto:a@b.com"]])).toBe("pass");
    expect(dmarcState([["v=DMARC1; p=none"]])).toBe("weak");
    expect(dmarcState([])).toBe("missing");
  });
  it("reads DKIM from any selector", () => {
    expect(dkimState([[], [["v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1234567890abcdef"]]])).toBe("pass");
    expect(dkimState([[], []])).toBe("missing");
  });
  it("summarises and says what to fix", () => {
    expect(domainHealth({ spf: null, dkim: null, dmarc: null })).toBe("unchecked");
    expect(domainHealth({ spf: "pass", dkim: "pass", dmarc: "pass" })).toBe("ready");
    expect(domainHealth({ spf: "pass", dkim: "missing", dmarc: "weak" })).toBe("fix");
    expect(domainFix({ spf: "pass", dkim: "missing", dmarc: "weak" })).toHaveLength(2);
  });
  it("checks a domain through an injected resolver", async () => {
    const zone: Record<string, string[][]> = { "x.com": [["v=spf1 include:_spf.google.com ~all"]], "_dmarc.x.com": [["v=DMARC1; p=quarantine"]], "google._domainkey.x.com": [["v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1234567890abcdef"]] };
    const r = await checkDomainDns("x.com", async (n) => zone[n] ?? []);
    expect(r).toEqual({ spf: "pass", dkim: "pass", dmarc: "pass" });
  });
});

describe("day boundary", () => {
  it("starts the IST day at 18:30 UTC the evening before", () => {
    expect(istDayStartEpoch("2026-11-19")).toBe(Date.parse("2026-11-18T18:30:00Z") / 1000);
  });
});

import { bannerFor } from "@/lib/sending/rules";

describe("banner on Today", () => {
  const i = (o: Partial<Parameters<typeof bannerFor>[0][number]> = {}) => ({ email: "m@x.com", sent: 0, queued: 0, max: 30, warn: 25, state: "ok" as const, paused: false, isDefault: true, ...o });
  it("stays quiet when all is well", () => {
    expect(bannerFor([i({ sent: 10, queued: 5 })])).toBeNull();
    expect(bannerFor([])).toBeNull();
  });
  it("warns early when today's queue will take the inbox past the level", () => {
    expect(bannerFor([i({ sent: 12, queued: 16 })])).toMatchObject({ tone: "heads_up" });
    expect(bannerFor([i({ sent: 10, queued: 15 })])).toBeNull(); // lands exactly on 25
  });
  it("turns amber over 25 and red at 30", () => {
    expect(bannerFor([i({ sent: 26, state: "warn" })])?.tone).toBe("warn");
    expect(bannerFor([i({ sent: 30, state: "full", queued: 4 })])?.tone).toBe("full");
    expect(bannerFor([i({ sent: 30, state: "full", queued: 4 })])?.text).toContain("4 more are due");
  });
  it("shows the most urgent one and ignores paused inboxes", () => {
    const b = bannerFor([i({ sent: 26, state: "warn" }), i({ email: "z@y.com", isDefault: false, sent: 30, state: "full", queued: 2 })]);
    expect(b?.tone).toBe("full");
    expect(bannerFor([i({ sent: 30, state: "full", paused: true })])).toBeNull();
  });
});

import { buildTiles, type HealthInputs } from "@/lib/settings/health";

describe("Overview tile", () => {
  const base = { me: { gmail: "ok", slackSet: true, signatureSet: true, mailbox: { shared: false, email: null, status: null } }, sync: { status: "ok", agoMin: 1, rows: 0 }, slack: { connected: true, channel: true }, feed: { configured: false, error: null }, linkedin: { lastAgoHours: 1, unmatched: 0 }, assistant: { enabled: true, usd: 0, usdCap: 50, credits: 0, creditCap: 500, warnPct: 80 }, drafting: { spent: 0, budget: 50 }, integrations: { enabled: 0, failing: 0, toReview: 0 }, team: { expiredGmail: 0 } } as HealthInputs;
  const tile = (s: NonNullable<HealthInputs["sending"]>) => buildTiles({ ...base, sending: s }).find((t) => t.id === "sending")!;
  const ok = { atWarn: 0, atMax: 0, paused: 0, domainsToFix: 0, outreachInboxes: 1, warn: 25, protectCore: "block" as const };
  it("is green when counts are low and domains are set up", () => expect(tile(ok).tone).toBe("ok"));
  it("turns amber over the warning level and red when paused or at the limit", () => {
    expect(tile({ ...ok, atWarn: 1 }).tone).toBe("warn");
    expect(tile({ ...ok, atMax: 1 }).tone).toBe("bad");
    expect(tile({ ...ok, paused: 1 }).tone).toBe("bad");
  });
  it("nudges to connect an outreach inbox when only the company domain exists", () => expect(tile({ ...ok, outreachInboxes: 0 }).tone).toBe("warn"));
  it("is absent for people who cannot see team health", () => expect(buildTiles(base).some((t) => t.id === "sending")).toBe(false));
});
