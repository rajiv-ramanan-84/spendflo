import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/calendar/dates";
import { LIMITS, TEST_ACCOUNT, decideRows, parseFeedTab, rowHash, contentKey, type DecideCtx, type FeedRow } from "@/lib/signals-feed/validate";

const today = "2026-11-10";
const ctx = (over: Partial<DecideCtx> = {}): DecideCtx => ({
  today, accounts: new Map([["ACC-001", { id: "u1", active: true }], ["ACC-002", { id: "u2", active: true }], ["ACC-003", { id: "u3", active: false }]]),
  known: new Map(), contentKeys: new Set(), acceptedToday: 0, accountsToday: new Set(), perAccountWeek: new Map(), ...over,
});
const row = (o: Partial<FeedRow> = {}): FeedRow => ({ sheetRow: 2, ref: "T-1", accountId: "ACC-001", signalId: "A1.S1", date: "2026-11-03", evidence: "Hiring a Contract Manager, posted this week.", url: "https://example.com/job", confidence: "Confirmed", replaces: "", ...o });
const one = (o: Partial<FeedRow> = {}, c: Partial<DecideCtx> = {}) => decideRows([row(o)], ctx(c))[0];

describe("accepts a good row", () => {
  it("accepts and normalises it", () => {
    const d = one({ signalId: "a1.s1", confidence: "likely", accountId: "acc-001" });
    expect(d.status).toBe("accepted");
    expect(d.accept).toMatchObject({ accountId: "u1", signalId: "A1.S1", seenOn: "2026-11-03", confidence: "likely", ref: "T-1" });
  });
  it("accepts an account event ID", () => { expect(one({ signalId: "E2" }).status).toBe("accepted"); });
});

describe("rejects what does not belong, with a reason the vendor can act on", () => {
  const cases: Array<[string, Partial<FeedRow>, RegExp]> = [
    ["no vendor ref", { ref: "" }, /Vendor ref is empty/],
    ["unknown signal", { signalId: "A9.S1" }, /listed signals/],
    ["a fit fact", { signalId: "A3.S6" }, /fit fact/],
    ["another fit fact", { signalId: "E5" }, /fit fact/],
    ["bad date", { date: "03/11/2026" }, /real date/],
    ["impossible date", { date: "2026-02-30" }, /real date/],
    ["future date", { date: "2026-11-11" }, /future/],
    ["too old", { date: addDays(today, -181) }, /180 days/],
    ["empty evidence", { evidence: "" }, /Evidence is empty/],
    ["long evidence", { evidence: "x".repeat(251) }, /251 characters/],
    ["no link", { url: "" }, /Source URL/],
    ["not a link", { url: "linkedin.com/in/someone" }, /https/],
    ["bad confidence", { confidence: "Maybe" }, /Confirmed or Likely/],
    ["unknown account", { accountId: "ACC-999" }, /not in Accounts to watch/],
    ["inactive account", { accountId: "ACC-003" }, /not active/],
    ["replaces nothing", { replaces: "T-0" }, /Replaces ref/],
  ];
  for (const [name, o, re] of cases) it(name, () => { const d = one(o); expect(d.status).toBe("rejected"); expect(d.reason).toMatch(re); });
  it("accepts a date exactly 180 days old", () => { expect(one({ date: addDays(today, -180) }).status).toBe("accepted"); });
});

describe("never counts the same thing twice", () => {
  it("marks the same event under a new ref as a duplicate", () => {
    const first = decideRows([row({ ref: "T-1" }), row({ ref: "T-2", sheetRow: 3, url: "https://www.example.com/job/?utm=1" })], ctx());
    expect(first.map((d) => d.status)).toEqual(["accepted", "duplicate"]);
  });
  it("marks an event already stored as a duplicate", () => {
    const keys = new Set([contentKey("u1", "A1.S1", "2026-11-03", "https://example.com/job")]);
    expect(one({}, { contentKeys: keys }).status).toBe("duplicate");
  });
  it("leaves rows decided earlier alone", () => {
    const known = new Map([["T-1", { hash: rowHash(row()), status: "accepted" }]]);
    expect(decideRows([row()], ctx({ known }))).toEqual([]);
  });
  it("does not let an accepted row be quietly edited", () => {
    const known = new Map([["T-1", { hash: "old", status: "accepted" }]]);
    const d = decideRows([row()], ctx({ known }))[0];
    expect(d.status).toBe("rejected");
    expect(d.reason).toMatch(/new Vendor ref/);
  });
  it("lets a rejected row be fixed in place", () => {
    const known = new Map([["T-1", { hash: "old", status: "rejected" }]]);
    expect(decideRows([row()], ctx({ known }))[0].status).toBe("accepted");
  });
  it("only counts the first of two rows sharing a ref", () => {
    const d = decideRows([row(), row({ sheetRow: 3, url: "https://example.com/other" })], ctx());
    expect(d.map((x) => x.status)).toEqual(["accepted", "duplicate"]);
  });
  it("accepts a replacement for a row accepted earlier in the same pass", () => {
    const d = decideRows([row({ ref: "T-1" }), row({ ref: "T-2", sheetRow: 3, url: "https://example.com/job-b", replaces: "T-1" })], ctx());
    expect(d.map((x) => x.status)).toEqual(["accepted", "accepted"]);
  });
  it("accepts a replacement for a known ref", () => {
    const known = new Map([["T-0", { hash: "h", status: "accepted" }]]);
    expect(one({ replaces: "T-0", ref: "T-9" }, { known }).accept?.replaces).toBe("T-0");
  });
});

describe("limits hold the line without losing rows", () => {
  it("holds rows past 500 a day for tomorrow", () => {
    const d = one({}, { acceptedToday: LIMITS.rowsPerDay });
    expect(d.status).toBe("deferred");
    expect(d.reason).toMatch(/500 rows/);
  });
  it("accepts the 500th row and defers the 501st", () => {
    const rows = [row({ ref: "A" }), row({ ref: "B", sheetRow: 3, accountId: "ACC-002" })];
    expect(decideRows(rows, ctx({ acceptedToday: 499 })).map((d) => d.status)).toEqual(["accepted", "deferred"]);
  });
  it("holds a new account past 50 a day, but not one already counted today", () => {
    const full = new Set(Array.from({ length: 50 }, (_, i) => `x${i}`));
    expect(one({}, { accountsToday: full }).status).toBe("deferred");
    full.delete("x0"); full.add("u1");
    expect(one({}, { accountsToday: full }).status).toBe("accepted");
  });
  it("holds more than 10 a week for one account", () => {
    expect(one({}, { perAccountWeek: new Map([["u1", 10]]) }).status).toBe("deferred");
    expect(one({}, { perAccountWeek: new Map([["u1", 9]]) }).status).toBe("accepted");
  });
  it("retries deferred rows with the same content", () => {
    const known = new Map([["T-1", { hash: rowHash(row()), status: "deferred" }]]);
    expect(decideRows([row()], ctx({ known }))[0].status).toBe("accepted");
  });
  it("counts accepted rows within one pass against the limits", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ ref: `R${i}`, sheetRow: i + 2, url: `https://example.com/${i}`, date: addDays(today, -i - 1) }));
    const s = decideRows(rows, ctx()).map((d) => d.status);
    expect(s.filter((x) => x === "accepted")).toHaveLength(LIMITS.perAccountPerWeek);
    expect(s.filter((x) => x === "deferred")).toHaveLength(2);
  });
});

describe("reading the tab", () => {
  const header = ["Vendor ref", "Account ID", "Signal ID", "Signal date", "Evidence", "Source URL", "Confidence", "Replaces ref", "Status", "Reason", "Effect"];
  it("finds columns by name in any order", () => {
    const swapped = ["Account ID", "Vendor ref", "Signal ID", "Signal date", "Evidence", "Source URL", "Confidence"];
    const r = parseFeedTab([swapped, ["ACC-001", "T-1", "A1.S1", "2026-11-03", "e", "https://x.com/a", "Confirmed"]]);
    expect(r.problem).toBeNull();
    expect(r.rows[0]).toMatchObject({ ref: "T-1", accountId: "ACC-001", sheetRow: 2 });
  });
  it("names missing columns instead of guessing", () => {
    expect(parseFeedTab([["Vendor ref", "Account ID"]]).problem).toMatch(/Signal ID/);
  });
  it("skips blank rows and keeps row numbers", () => {
    const r = parseFeedTab([header, [], ["T-1", "ACC-001", "A1.S1", "2026-11-03", "e", "https://x.com/a", "Confirmed"]]);
    expect(decideRows(r.rows, ctx()).map((d) => d.row.sheetRow)).toEqual([3]);
  });
});

describe("the test account", () => {
  const withTest = (c: Partial<DecideCtx> = {}) => ctx({ accounts: new Map([["ACC-TEST", { id: TEST_ACCOUNT.id, active: true }], ["ACC-001", { id: "u1", active: true }]]), ...c });
  it("gets the full checks and is accepted when the row is good", () => {
    const d = decideRows([row({ accountId: "ACC-TEST" })], withTest())[0];
    expect(d.status).toBe("accepted");
    expect(d.accept?.accountId).toBe(TEST_ACCOUNT.id);
  });
  it("still rejects bad rows, so the vendor sees real feedback", () => {
    expect(decideRows([row({ accountId: "ACC-TEST", url: "" })], withTest())[0].status).toBe("rejected");
    expect(decideRows([row({ accountId: "ACC-TEST", signalId: "A9.S9" })], withTest())[0].status).toBe("rejected");
    expect(decideRows([row({ accountId: "ACC-TEST", date: addDays(today, -200) })], withTest())[0].status).toBe("rejected");
  });
  it("flags a repeated test event as a duplicate", () => {
    const d = decideRows([row({ accountId: "ACC-TEST", ref: "A" }), row({ accountId: "ACC-TEST", ref: "B", sheetRow: 3 })], withTest());
    expect(d.map((x) => x.status)).toEqual(["accepted", "duplicate"]);
  });
  it("never uses up the real limits, even with hundreds of test rows", () => {
    const many = Array.from({ length: 600 }, (_, i) => row({ accountId: "ACC-TEST", ref: `X${i}`, sheetRow: i + 2, url: `https://example.com/${i}`, date: addDays(today, -(i % 100)), signalId: i % 2 ? "A1.S1" : "E2" }));
    const d = decideRows([...many, row({ ref: "REAL", sheetRow: 700 })], withTest({ acceptedToday: LIMITS.rowsPerDay - 1 }));
    expect(d[d.length - 1].status).toBe("accepted");
  });
  it("can be corrected with a replacement", () => {
    const d = decideRows([row({ accountId: "ACC-TEST", ref: "T1" }), row({ accountId: "ACC-TEST", ref: "T8", sheetRow: 3, url: "https://example.com/1b", replaces: "T1" })], withTest());
    expect(d.map((x) => x.status)).toEqual(["accepted", "accepted"]);
  });
});
