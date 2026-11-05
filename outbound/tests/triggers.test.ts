import { describe, expect, it } from "vitest";
import { datesForTriggeredTrack, tracksToStart } from "@/lib/campaigns/triggers";
import { prospectHolidayLookup } from "@/lib/calendar/holidays";

const ctx = { prospectHolidays: prospectHolidayLookup([2026, 2027]), teamHolidays: new Set<string>(), outOfOffice: new Map(), quietPeriods: [] };

describe("trigger-based tracks", () => {
  it("starts 2 working days after a Wednesday reply before Thanksgiving, skipping the holiday", () => {
    const r = datesForTriggeredTrack([{ id: "e", offset: 0 }, { id: "c", offset: 3 }], "2026-11-25", 2, {}, ctx);
    expect(r.startDate).toBe("2026-11-30");
    expect(r.steps).toEqual([{ id: "e", date: "2026-11-30" }, { id: "c", date: "2026-12-03" }]);
  });

  it("keeps the minimum gap even if offsets are too tight", () => {
    const r = datesForTriggeredTrack([{ id: "a", offset: 0 }, { id: "b", offset: 1 }], "2026-11-02", 0, {}, ctx);
    expect(r.steps.map((s) => s.date)).toEqual(["2026-11-02", "2026-11-04"]);
  });

  it("respects the sender's out of office", () => {
    const ooo = { ...ctx, outOfOffice: new Map([["sid", [{ start: "2026-11-30", end: "2026-12-02" }]]]) };
    const r = datesForTriggeredTrack([{ id: "e", offset: 0 }], "2026-11-25", 2, { assigneeId: "sid" }, ooo);
    expect(r.startDate).toBe("2026-12-03");
  });

  it("picks the tracks a reply or a finished step should start", () => {
    const waiting = [
      { trackId: "cfo", type: "after_reply" as const, fromContactId: "vp", stepIndex: null },
      { trackId: "champ", type: "after_step" as const, fromContactId: "vp", stepIndex: 2 },
      { trackId: "other", type: "after_reply" as const, fromContactId: "someone", stepIndex: null },
    ];
    expect(tracksToStart(waiting, { kind: "reply", contactId: "vp" })).toEqual(["cfo"]);
    expect(tracksToStart(waiting, { kind: "step_done", contactId: "vp", sequenceNo: 1 })).toEqual([]);
    expect(tracksToStart(waiting, { kind: "step_done", contactId: "vp", sequenceNo: 2 })).toEqual(["champ"]);
  });
});
