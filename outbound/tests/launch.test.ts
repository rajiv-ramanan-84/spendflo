import { describe, expect, it } from "vitest";
import { canLaunch, openFlags, rebaseTrack, stepStatusOn } from "@/lib/campaigns/launch";
import { prospectHolidayLookup } from "@/lib/calendar/holidays";

const ctx = { prospectHolidays: prospectHolidayLookup([2026, 2027]), teamHolidays: new Set<string>(), outOfOffice: new Map(), quietPeriods: [] };
const flags = [{ id: "f1", text: "Unapproved reference" }, { id: "f2", text: "Undated trigger" }];

describe("launch gate", () => {
  it("blocks while any flag is open", () => {
    expect(canLaunch(flags, ["f1"], 3)).toEqual({ ok: false, reason: "1 review flag to resolve or dismiss" });
    expect(openFlags(flags, ["f1"]).map((f) => f.id)).toEqual(["f2"]);
  });

  it("opens once every flag is cleared", () => {
    expect(canLaunch(flags, ["f1", "f2"], 3)).toEqual({ ok: true, reason: null });
  });

  it("needs at least one dated step", () => {
    expect(canLaunch([], [], 0).ok).toBe(false);
  });
});

describe("rebaseTrack", () => {
  it("leaves a future track untouched", () => {
    const r = rebaseTrack([{ id: "a", date: "2026-11-10" }, { id: "b", date: "2026-11-13" }], "2026-11-06", {}, ctx);
    expect(r.map((s) => [s.date, s.movedFrom])).toEqual([["2026-11-10", null], ["2026-11-13", null]]);
  });

  it("moves past steps to today or later, keeping order, gaps and working days", () => {
    // Draft made for 2 to 9 Nov, launched on Tue 10 Nov
    const r = rebaseTrack([{ id: "a", date: "2026-11-02" }, { id: "b", date: "2026-11-05" }, { id: "c", date: "2026-11-20" }], "2026-11-10", {}, ctx);
    expect(r.map((s) => s.date)).toEqual(["2026-11-10", "2026-11-13", "2026-11-20"]); // 11 Nov is a holiday
    expect(r[0].movedFrom).toBe("2026-11-02");
    expect(r[2].movedFrom).toBeNull();
  });
});

describe("stepStatusOn", () => {
  it("derives due and overdue from the date", () => {
    expect(stepStatusOn("2026-11-10", { status: "upcoming", due_date: "2026-11-09" })).toBe("overdue");
    expect(stepStatusOn("2026-11-10", { status: "upcoming", due_date: "2026-11-10" })).toBe("due");
    expect(stepStatusOn("2026-11-10", { status: "due", due_date: "2026-11-12" })).toBe("upcoming");
    expect(stepStatusOn("2026-11-10", { status: "done", due_date: "2026-11-01" })).toBe("done");
  });
});
