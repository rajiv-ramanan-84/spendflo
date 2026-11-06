import { describe, expect, it } from "vitest";
import { DEFAULT_CAPS, scheduleTouches, weekStart, type Touch } from "@/lib/caps/schedule";
import { prospectHolidayLookup } from "@/lib/calendar/holidays";
import type { CalendarContext } from "@/lib/calendar/working-calendar";

const ctx: CalendarContext = {
  prospectHolidays: prospectHolidayLookup([2026, 2027]),
  teamHolidays: new Set(),
  outOfOffice: new Map(),
  quietPeriods: [],
};

let n = 0;
const t = (date: string, over: Partial<Touch> = {}): Touch => ({
  key: `s${++n}`,
  date,
  contactId: "c1",
  accountId: "a1",
  assigneeId: "rajiv",
  channel: "email",
  ...over,
});

describe("weekStart", () => {
  it("returns the Monday", () => {
    expect(weekStart("2026-11-05")).toBe("2026-11-02"); // Thu
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sun
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // Mon
  });
});

describe("collision guard: one touch per contact per day across the team", () => {
  it("moves the second teammate's touch to the next working day", () => {
    const { scheduled } = scheduleTouches(
      [t("2026-11-10", { assigneeId: "sid" })],
      [t("2026-11-10", { assigneeId: "rajiv" })],
      DEFAULT_CAPS,
      ctx,
    );
    expect(scheduled[0]).toMatchObject({ date: "2026-11-12", movedFrom: "2026-11-10", reasons: ["contact_already_touched_that_day"] });
    // 11 Nov is Veterans Day, so the next working day is the 12th
  });

  it("lets two different contacts be touched the same day", () => {
    const { scheduled } = scheduleTouches([t("2026-11-10"), t("2026-11-10", { contactId: "c2" })], [], DEFAULT_CAPS, ctx);
    expect(scheduled.map((s) => s.date)).toEqual(["2026-11-10", "2026-11-10"]);
    expect(scheduled.every((s) => s.movedFrom === null)).toBe(true);
  });

  it("never lands a moved step on a weekend or holiday", () => {
    const { scheduled } = scheduleTouches([t("2026-11-25")], [t("2026-11-25")], DEFAULT_CAPS, ctx);
    expect(scheduled[0].date).toBe("2026-11-27"); // skips Thanksgiving
  });
});

describe("weekly caps", () => {
  it("allows 3 touches to one contact in a week, then rolls the 4th to next week", () => {
    const { scheduled } = scheduleTouches(
      [t("2026-11-02"), t("2026-11-03"), t("2026-11-04"), t("2026-11-05")],
      [],
      DEFAULT_CAPS,
      ctx,
    );
    expect(scheduled.map((s) => s.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-09"]);
    expect(scheduled[3].reasons).toContain("contact_weekly_cap");
  });

  it("caps an account at 6 touches a week across its contacts", () => {
    const touches = Array.from({ length: 7 }, (_, i) => t("2026-11-02", { contactId: `c${i}` }));
    const { scheduled } = scheduleTouches(touches, [], DEFAULT_CAPS, ctx);
    expect(scheduled.filter((s) => s.date === "2026-11-02")).toHaveLength(6);
    expect(scheduled[6]).toMatchObject({ date: "2026-11-09", reasons: ["account_weekly_cap"] });
  });

  it("counts what is already scheduled", () => {
    const { scheduled } = scheduleTouches([t("2026-11-05")], [t("2026-11-02"), t("2026-11-03"), t("2026-11-04")], DEFAULT_CAPS, ctx);
    expect(scheduled[0].date).toBe("2026-11-09");
  });
});

describe("per-person load", () => {
  it("rolls overflow past 25 steps a day to the next working day", () => {
    const existing = Array.from({ length: 25 }, (_, i) => t("2026-11-10", { contactId: `x${i}`, accountId: `ax${i}` }));
    const { scheduled } = scheduleTouches([t("2026-11-10", { contactId: "new", accountId: "anew" })], existing, DEFAULT_CAPS, ctx);
    expect(scheduled[0]).toMatchObject({ date: "2026-11-12", reasons: ["assignee_daily_cap"] });
  });

  it("does not count a teammate's load against you", () => {
    const existing = Array.from({ length: 25 }, (_, i) => t("2026-11-10", { contactId: `x${i}`, accountId: `ax${i}`, assigneeId: "sid" }));
    const { scheduled } = scheduleTouches([t("2026-11-10", { contactId: "new", accountId: "anew" })], existing, DEFAULT_CAPS, ctx);
    expect(scheduled[0].date).toBe("2026-11-10");
  });

  it("respects the assignee's out of office", () => {
    const ooo: CalendarContext = { ...ctx, outOfOffice: new Map([["rajiv", [{ start: "2026-11-09", end: "2026-11-13" }]]]) };
    const { scheduled } = scheduleTouches([t("2026-11-10")], [], DEFAULT_CAPS, ooo);
    expect(scheduled[0].date).toBe("2026-11-16");
  });
});

describe("LinkedIn invites", () => {
  it("caps connect requests per person per week and warns at 80%", () => {
    const caps = { ...DEFAULT_CAPS, linkedin_connects_per_person_per_week: 5 };
    const touches = Array.from({ length: 6 }, (_, i) => t("2026-11-02", { contactId: `c${i}`, accountId: `a${i}`, channel: "linkedin_connect" }));
    const { scheduled, warnings } = scheduleTouches(touches, [], caps, ctx);
    expect(scheduled.filter((s) => s.date === "2026-11-02")).toHaveLength(5);
    expect(scheduled[5]).toMatchObject({ date: "2026-11-09", reasons: ["linkedin_weekly_cap"] });
    expect(warnings).toEqual([{ assigneeId: "rajiv", week: "2026-11-02", connects: 5, cap: 5 }]);
  });

  it("does not count emails against the LinkedIn cap", () => {
    const caps = { ...DEFAULT_CAPS, linkedin_connects_per_person_per_week: 1 };
    const { scheduled } = scheduleTouches(
      [t("2026-11-02", { channel: "linkedin_connect" }), t("2026-11-02", { contactId: "c2", channel: "email" })],
      [],
      caps,
      ctx,
    );
    expect(scheduled.map((s) => s.date)).toEqual(["2026-11-02", "2026-11-02"]);
  });
});

describe("ordering", () => {
  it("places earlier steps first so they keep their slot, and returns input order", () => {
    const { scheduled } = scheduleTouches([t("2026-11-12", { key: "late" }), t("2026-11-10", { key: "early" })], [t("2026-11-10")], DEFAULT_CAPS, ctx);
    expect(scheduled.map((s) => s.key)).toEqual(["late", "early"]);
    // early collides with the existing touch and moves to the 12th; late then collides and moves to the 13th
    expect(scheduled.map((s) => s.date)).toEqual(["2026-11-13", "2026-11-12"]);
  });
});
