import { describe, expect, it } from "vitest";
import { addDays, isWeekend, todayIn } from "@/lib/calendar/dates";
import { prospectHolidayLookup, publicHolidays } from "@/lib/calendar/holidays";
import {
  addWorkingDays,
  defaultCampaignStart,
  invalidReasons,
  isValidDate,
  listValidDates,
  nextValidDate,
  reasonCopy,
  rollForward,
  shiftForResume,
  snooze,
  workingDaysBetween,
  type CalendarContext,
  type QuietPeriod,
} from "@/lib/calendar/working-calendar";

// The team follows the US federal calendar. 12 Nov 2026 is a made-up extra
// company day so it lands mid-week next to Veterans Day.
const TEAM = new Set([...prospectHolidayLookup([2026, 2027])("US"), "2026-11-12"]);

function ctx(overrides: Partial<CalendarContext> = {}): CalendarContext {
  return {
    prospectHolidays: prospectHolidayLookup([2026, 2027]),
    teamHolidays: TEAM,
    outOfOffice: new Map([["sid", [{ start: "2026-11-16", end: "2026-11-18" }]]]),
    quietPeriods: [],
    ...overrides,
  };
}
const US = {};

describe("US federal holidays", () => {
  it("loads the federal list, including observed days", () => {
    const dates = publicHolidays("US", [2026]).map((h) => h.date);
    expect(dates).toEqual([
      "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03",
      "2026-07-04", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
    ]);
  });

  it("blocks Veterans Day, Wed 11 Nov 2026", () => {
    expect(invalidReasons("2026-11-11", US, ctx())).toEqual(["prospect_holiday", "team_holiday"]);
    expect(isValidDate("2026-11-10", US, ctx())).toBe(true);
  });

  it("blocks Thanksgiving, Thu 26 Nov 2026, but not the Friday after", () => {
    expect(invalidReasons("2026-11-26", US, ctx())).toEqual(["prospect_holiday", "team_holiday"]);
    expect(isValidDate("2026-11-27", US, ctx())).toBe(true);
  });

  it("blocks the observed Independence Day, Fri 3 Jul 2026", () => {
    expect(isValidDate("2026-07-03", US, ctx())).toBe(false);
  });

  it("blocks Christmas 2026 and the observed Christmas 2027", () => {
    expect(isValidDate("2026-12-25", US, ctx())).toBe(false);
    expect(isValidDate("2027-12-24", US, ctx())).toBe(false);
  });
});

describe("weekends", () => {
  it("are never valid", () => {
    expect(isWeekend("2026-11-07")).toBe(true);
    expect(invalidReasons("2026-11-08", US, ctx())).toEqual(["weekend"]);
  });
});

describe("team holidays (US federal plus company days)", () => {
  it("an extra company day blocks a date even when the prospect is working", () => {
    expect(invalidReasons("2026-11-12", US, ctx())).toEqual(["team_holiday"]);
  });

  it("US holidays are team days off too, for any prospect country", () => {
    expect(invalidReasons("2026-11-26", US, ctx())).toEqual(["prospect_holiday", "team_holiday"]);
    expect(invalidReasons("2026-11-26", { country: "GB" }, ctx())).toEqual(["team_holiday"]);
  });

  it("India holidays are ordinary working days", () => {
    for (const d of ["2026-01-26", "2026-10-02"]) expect(isValidDate(d, US, ctx())).toBe(true);
  });

  it("stack with prospect holidays: Tue 10 Nov + 1 working day skips 11 and 12 Nov", () => {
    expect(addWorkingDays("2026-11-10", 1, US, ctx())).toBe("2026-11-13");
  });
});

describe("out of office", () => {
  it("blocks only that assignee", () => {
    expect(invalidReasons("2026-11-17", { assigneeId: "sid" }, ctx())).toEqual(["assignee_out_of_office"]);
    expect(isValidDate("2026-11-17", { assigneeId: "rajiv" }, ctx())).toBe(true);
    expect(isValidDate("2026-11-17", US, ctx())).toBe(true);
  });

  it("moves Sid's step to his first day back", () => {
    expect(nextValidDate("2026-11-16", { assigneeId: "sid" }, ctx())).toBe("2026-11-19");
  });
});

describe("quiet periods", () => {
  const yearEnd: QuietPeriod = { name: "Year end", start: "2026-12-24", end: "2027-01-01", enabled: true };

  it("block dates only when enabled", () => {
    expect(invalidReasons("2026-12-28", US, ctx({ quietPeriods: [yearEnd] }))).toEqual(["quiet_period"]);
    expect(isValidDate("2026-12-28", US, ctx({ quietPeriods: [{ ...yearEnd, enabled: false }] }))).toBe(true);
  });

  it("roll a year-end date into January", () => {
    expect(nextValidDate("2026-12-23", US, ctx({ quietPeriods: [yearEnd] }))).toBe("2026-12-23");
    expect(nextValidDate("2026-12-24", US, ctx({ quietPeriods: [yearEnd] }))).toBe("2027-01-04");
  });
});

describe("rollForward (validating Claude's dates)", () => {
  it("keeps a valid date untouched", () => {
    expect(rollForward("2026-11-10", US, ctx())).toEqual({ date: "2026-11-10", movedFrom: null, reasons: [] });
  });

  it("moves Veterans Day to the next valid day and says why", () => {
    expect(rollForward("2026-11-11", US, ctx())).toEqual({
      date: "2026-11-13",
      movedFrom: "2026-11-11",
      reasons: ["prospect_holiday", "team_holiday"],
    });
  });

  it("names a US holiday once in the moved note", () => {
    expect(reasonCopy(["prospect_holiday", "team_holiday"])).toEqual(["US holiday"]);
    expect(reasonCopy(["team_holiday"])).toEqual(["company day off"]);
    expect(reasonCopy(["prospect_holiday"])).toEqual(["prospect holiday"]);
  });

  it("moves a Saturday to Monday", () => {
    expect(rollForward("2026-11-07", US, ctx()).date).toBe("2026-11-09");
  });
});

describe("addWorkingDays", () => {
  it("counts working days, not calendar days", () => {
    expect(addWorkingDays("2026-11-05", 2, US, ctx())).toBe("2026-11-09"); // Thu + 2 = Mon
  });

  it("skips Thanksgiving: 2 working days after a Wed 25 Nov reply is Mon 30 Nov", () => {
    expect(addWorkingDays("2026-11-25", 2, US, ctx())).toBe("2026-11-30");
  });

  it("n = 0 means the next valid day on or after", () => {
    expect(addWorkingDays("2026-11-26", 0, US, ctx())).toBe("2026-11-27");
  });

  it("rejects negative or fractional offsets", () => {
    expect(() => addWorkingDays("2026-11-05", -1, US, ctx())).toThrow();
    expect(() => addWorkingDays("2026-11-05", 1.5, US, ctx())).toThrow();
  });

  it("always lands on a valid day, every start date for 14 months", () => {
    const c = ctx();
    for (let d = "2026-11-01"; d < "2027-12-31"; d = addDays(d, 1)) {
      for (const n of [1, 2, 3]) {
        expect(isValidDate(addWorkingDays(d, n, { assigneeId: "sid" }, c), { assigneeId: "sid" }, c)).toBe(true);
      }
    }
  });
});

describe("listValidDates (valid_working_dates sent to Claude)", () => {
  it("returns 30 ascending valid dates with no weekend or holiday", () => {
    const dates = listValidDates("2026-11-06", 30, US, ctx());
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2026-11-06");
    expect(new Set(dates).size).toBe(30);
    expect([...dates].sort()).toEqual(dates);
    for (const d of dates) expect(isValidDate(d, US, ctx())).toBe(true);
    expect(dates).not.toContain("2026-11-11");
    expect(dates).not.toContain("2026-11-12");
    expect(dates).not.toContain("2026-11-26");
    expect(dates).toContain("2026-11-27");
  });

  it("starts on the next valid day when given a holiday", () => {
    expect(listValidDates("2026-11-26", 1, US, ctx())).toEqual(["2026-11-27"]);
  });
});

describe("pause, resume and snooze", () => {
  it("counts working days lost while paused", () => {
    // Paused Mon 23 Nov, resumed Mon 30 Nov: 23, 24, 25, 27 (Thanksgiving skipped)
    expect(workingDaysBetween("2026-11-23", "2026-11-30", US, ctx())).toBe(4);
  });

  it("shifts remaining steps by the working days lost", () => {
    const shifted = shiftForResume(
      [
        { id: "a", date: "2026-11-24", scope: US },
        { id: "b", date: "2026-11-27", scope: US },
      ],
      "2026-11-23",
      "2026-11-30",
      ctx(),
    );
    expect(shifted.map((s) => s.newDate)).toEqual(["2026-12-01", "2026-12-03"]);
  });

  it("snoozes in working days", () => {
    expect(snooze("2026-11-25", 1, US, ctx())).toBe("2026-11-27");
    expect(snooze("2026-11-25", 3, US, ctx())).toBe("2026-12-01");
  });

  it("defaults the campaign start to the next working day", () => {
    expect(defaultCampaignStart("2026-11-05", ctx())).toBe("2026-11-06");
    expect(defaultCampaignStart("2026-11-10", ctx())).toBe("2026-11-13");
  });
});

describe("non-US contacts", () => {
  it("use their own country's holidays instead of the US list", () => {
    expect(isValidDate("2026-11-25", { country: "GB" }, ctx())).toBe(true);
    expect(isValidDate("2026-12-28", { country: "GB" }, ctx())).toBe(false); // Boxing Day observed
  });

  it("fall back to weekends only for an unknown country, still honouring team holidays", () => {
    expect(isValidDate("2026-11-25", { country: "XX" }, ctx())).toBe(true);
    expect(isValidDate("2026-11-12", { country: "XX" }, ctx())).toBe(false);
  });
});

describe("guards", () => {
  it("rejects malformed dates", () => {
    expect(() => isValidDate("2026-02-30", US, ctx())).toThrow();
    expect(() => isValidDate("26/11/2026", US, ctx())).toThrow();
  });

  it("throws instead of looping forever when nothing is valid", () => {
    const allYear: QuietPeriod = { start: "2026-01-01", end: "2028-12-31", enabled: true };
    expect(() => nextValidDate("2026-11-05", US, ctx({ quietPeriods: [allYear] }))).toThrow();
  });

  it("reads 'today' in IST by default", () => {
    expect(todayIn("Asia/Kolkata", new Date("2026-11-05T20:00:00Z"))).toBe("2026-11-06");
    expect(todayIn("America/New_York", new Date("2026-11-05T20:00:00Z"))).toBe("2026-11-05");
  });
});
