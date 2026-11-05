import { describe, expect, it } from "vitest";
import { prospectHolidayLookup } from "@/lib/calendar/holidays";
import type { CalendarContext } from "@/lib/calendar/working-calendar";
import { alertWorthy, esc, mention, morningParent, personThread, replyAlert } from "@/lib/slack/messages";
import { isPastPostTime, teamDayOff } from "@/lib/slack/schedule";

const APP = "https://occ.example";
const ctx = (over: Partial<CalendarContext> = {}): CalendarContext => ({
  prospectHolidays: prospectHolidayLookup([2026]),
  teamHolidays: new Set([...prospectHolidayLookup([2026])("US"), "2026-11-12"]),
  outOfOffice: new Map(),
  quietPeriods: [],
  ...over,
});
const flat = (m: { blocks: unknown[] }) => JSON.stringify(m.blocks);

describe("morning post calendar", () => {
  it("posts on a normal working day", () => {
    expect(teamDayOff("2026-11-10", ctx())).toEqual([]);
  });
  it("skips weekends and extra company days", () => {
    expect(teamDayOff("2026-11-07", ctx())).toContain("weekend");
    expect(teamDayOff("2026-11-12", ctx())).toEqual(["team_holiday"]);
  });
  it("skips US holidays (Veterans Day, Thanksgiving): the team is off", () => {
    expect(teamDayOff("2026-11-11", ctx())).toEqual(["team_holiday"]);
    expect(teamDayOff("2026-11-26", ctx())).toEqual(["team_holiday"]);
  });
  it("posts on India holidays: ordinary working days", () => {
    expect(teamDayOff("2026-10-02", ctx())).toEqual([]);
  });
  it("skips an enabled quiet period only", () => {
    expect(teamDayOff("2026-12-28", ctx({ quietPeriods: [{ start: "2026-12-24", end: "2027-01-01", enabled: true }] }))).toEqual(["quiet_period"]);
    expect(teamDayOff("2026-12-28", ctx({ quietPeriods: [{ start: "2026-12-24", end: "2027-01-01", enabled: false }] }))).toEqual([]);
  });
  it("waits for 8:30 IST", () => {
    expect(isPastPostTime(new Date("2026-11-10T02:59:00Z"), "08:30", "Asia/Kolkata")).toBe(false); // 08:29 IST
    expect(isPastPostTime(new Date("2026-11-10T03:00:00Z"), "08:30", "Asia/Kolkata")).toBe(true); // 08:30 IST
  });
});

describe("slack copy", () => {
  it("mentions mapped handles and falls back to first name", () => {
    expect(mention({ name: "Mouli", slackUserId: "U01ABC" })).toBe("<@U01ABC>");
    expect(mention({ name: "Shweta Das", slackUserId: null })).toBe("Shweta");
  });
  it("escapes Slack control characters", () => {
    expect(esc("AT&T <ops>")).toBe("AT&amp;T &lt;ops&gt;");
  });
  it("leads the morning post with wins and keeps overdue to a count", () => {
    const m = morningParent("Tuesday, Nov 10", { dueToday: 18, repliesWaiting: 2, overdue: 4, newDrafts: 1, meetingsYesterday: 1, repliesYesterday: 3 }, APP);
    const body = flat(m);
    expect(body.indexOf("meeting booked")).toBeLessThan(body.indexOf("18 steps due today"));
    expect(body).toContain("4 overdue");
    expect(body).not.toMatch(/—/);
  });
  it("threads one person's plan with top 3 focus accounts linked", () => {
    const m = personThread({
      person: { name: "Mouli", slackUserId: "U1" }, dueToday: 6, overdue: 1, replies: 1,
      byChannel: { email: 3, linkedin: 2, call: 1 },
      focus: [1, 2, 3, 4].map((i) => ({ id: `a${i}`, name: `Acct ${i}`, reason: "Reply waiting" })),
      needsReconnect: true,
    }, APP);
    const body = flat(m);
    expect(body).toContain("<@U1>: 6 steps today (3 email, 2 LinkedIn, 1 call), 1 reply to work · 1 carried over");
    expect(body).toContain(`<${APP}/accounts/a3|Acct 3>`);
    expect(body).not.toContain("Acct 4");
    expect(body).toContain("Gmail needs reconnecting");
    expect(m.text).not.toContain("<@");
  });
  it("gives an empty day a calm line", () => {
    const m = personThread({ person: { name: "Sid", slackUserId: null }, dueToday: 0, overdue: 0, replies: 0, byChannel: { email: 0, linkedin: 0, call: 0 }, focus: [], needsReconnect: false }, APP);
    expect(flat(m)).toContain("Sid: a clear day");
  });
  it("reply alert: one-line summary only, @owner, deep link to the card", () => {
    const m = replyAlert({
      responseId: "r1", accountId: "acc1", accountName: "Ahold Delhaize USA", contactName: "Patrick Vestergaard", persona: "procurement_leader",
      classification: "positive", summary: "Wants to talk Tuesday.\nSecond line should not appear", channel: "email",
      owner: { name: "Mouli", slackUserId: "U1" }, source: "detected",
    }, APP);
    const body = flat(m);
    expect(body).toContain("Patrick Vestergaard (procurement leader)");
    expect(body).toContain("Positive · Wants to talk Tuesday.");
    expect(body).not.toContain("Second line");
    expect(body).toContain("<@U1>");
    expect(body).toContain(`${APP}/accounts/acc1?reply=r1`);
  });
  it("does not alert on out of office", () => {
    expect(alertWorthy("auto_reply")).toBe(false);
    expect(alertWorthy("positive")).toBe(true);
    expect(alertWorthy(null)).toBe(true);
  });
});
