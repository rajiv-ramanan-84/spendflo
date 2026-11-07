import { describe, expect, it } from "vitest";
import { prospectHolidayLookup } from "@/lib/calendar/holidays";
import { projectTriggeredTracks, type PTrack } from "@/lib/campaigns/projection";

const ctx = { prospectHolidays: prospectHolidayLookup([2026]), teamHolidays: new Set([...prospectHolidayLookup([2026])("US")]), outOfOffice: new Map(), quietPeriods: [] };
const names = new Map([["bobby", "Bobby"], ["tony", "Tony"]]);
const step = (id: string, seq: number, status: string, due: string | null, offset = 0, completed: string | null = null) => ({ id, sequence_no: seq, status, due_date: due, completed_at: completed, offset_working_days: offset });
const bobby = (s2status = "upcoming", trackStatus = "active"): PTrack => ({ id: "tb", contact_id: "bobby", status: trackStatus, start_trigger_type: "fixed", trigger_from_contact_id: null, trigger_step_index: null, delay_working_days: null,
  steps: [step("b1", 1, "done", "2026-11-09", 0, "2026-11-09T10:00:00Z"), step("b2", 2, s2status, "2026-11-13")] });
const tony = (over: Partial<PTrack> = {}): PTrack => ({ id: "tt", contact_id: "tony", status: "not_started", start_trigger_type: "after_step", trigger_from_contact_id: "bobby", trigger_step_index: 2, delay_working_days: 3,
  steps: [step("t1", 1, "upcoming", null, 0), step("t2", 2, "upcoming", null, 4), step("t3", 3, "upcoming", null, 8)], ...over });

describe("projected dates for triggered tracks", () => {
  it("projects from the trigger step's due date, on working days only", () => {
    const [p] = projectTriggeredTracks([bobby(), tony()], names, ctx);
    expect(p.kind).toBe("projected");
    if (p.kind !== "projected") return;
    // Fri 13 Nov + 3 working days = Wed 18 Nov; then +4 = Tue 24 Nov; then +8 skips Thanksgiving (26 Nov) = Mon 30 Nov... via working days
    expect(p.dates).toEqual({ t1: "2026-11-18", t2: "2026-11-24", t3: "2026-12-01" });
    expect(p.basis).toMatch(/3 working days after Bobby's step 2 \(due 2026-11-13\)/);
  });

  it("uses the sent date once the trigger step is done", () => {
    const b = bobby();
    b.steps[1] = step("b2", 2, "done", "2026-11-13", 0, "2026-11-12T09:00:00Z");
    const [p] = projectTriggeredTracks([b, tony()], names, ctx);
    expect(p.kind === "projected" && p.dates.t1).toBe("2026-11-17");
  });

  it("flags a trigger that can no longer happen", () => {
    expect(projectTriggeredTracks([bobby("skipped"), tony()], names, ctx)[0]).toMatchObject({ kind: "stuck", reason: "Bobby's step 2 was skipped" });
    expect(projectTriggeredTracks([bobby("upcoming", "paused"), tony()], names, ctx)[0]).toMatchObject({ kind: "stuck", reason: "Bobby's track is paused" });
    expect(projectTriggeredTracks([tony()], names, ctx)[0].kind).toBe("stuck");
  });

  it("explains reply-triggered tracks, and ignores fixed or started ones", () => {
    expect(projectTriggeredTracks([bobby(), tony({ start_trigger_type: "after_reply" })], names, ctx)[0]).toMatchObject({ kind: "on_reply", basis: "starts 3 working days after Bobby replies" });
    expect(projectTriggeredTracks([bobby(), tony({ status: "active" })], names, ctx)).toEqual([]);
  });
});
