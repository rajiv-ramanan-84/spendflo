import type { IsoDate } from "@/lib/calendar/dates";
import { addWorkingDays, type CalendarContext, type DateScope } from "@/lib/calendar/working-calendar";

/**
 * Trigger-based tracks (PRD section 4): "start the CFO track 2 working days
 * after the VP replies". Pure date maths; the caller saves and schedules.
 */

export type WaitingStep = { id: string; offset: number };

/**
 * Dates for a track whose trigger just fired. The first step lands `delay`
 * working days after the trigger; each step's offset counts from there, and
 * consecutive steps keep at least `minGap` working days apart.
 */
export function datesForTriggeredTrack(steps: readonly WaitingStep[], triggerDate: IsoDate, delay: number, scope: DateScope, ctx: CalendarContext, minGap = 2) {
  const start = addWorkingDays(triggerDate, Math.max(0, delay), scope, ctx);
  const ordered = [...steps].sort((a, b) => a.offset - b.offset);
  const out: Array<{ id: string; date: IsoDate }> = [];
  let prev: IsoDate | null = null;
  for (const s of ordered) {
    let date = addWorkingDays(start, Math.max(0, s.offset), scope, ctx);
    if (prev) {
      const earliest = addWorkingDays(prev, minGap, scope, ctx);
      if (date < earliest) date = earliest;
    }
    out.push({ id: s.id, date });
    prev = date;
  }
  return { startDate: out[0]?.date ?? start, steps: out };
}

export type TrackTrigger = {
  trackId: string;
  type: "after_reply" | "after_step";
  fromContactId: string | null;
  stepIndex: number | null;
};

/** Which waiting tracks a completed step or a reply should start. */
export function tracksToStart(waiting: readonly TrackTrigger[], event: { kind: "step_done"; contactId: string; sequenceNo: number } | { kind: "reply"; contactId: string }): string[] {
  return waiting
    .filter((t) => {
      if (t.fromContactId !== event.contactId) return false;
      if (event.kind === "reply") return t.type === "after_reply";
      return t.type === "after_step" && (t.stepIndex === null || t.stepIndex === event.sequenceNo);
    })
    .map((t) => t.trackId);
}
