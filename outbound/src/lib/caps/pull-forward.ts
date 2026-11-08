import type { IsoDate } from "@/lib/calendar/dates";
import { invalidReasons, reasonCopy, type CalendarContext } from "@/lib/calendar/working-calendar";
import { MOVE_REASON_COPY, scheduleTouches, type Caps, type Touch } from "./schedule";

/**
 * "Do today": can a future step be pulled forward to today? Pure.
 * Same rules as the scheduler, so fast-tracking never breaks a plan:
 * - the earlier steps for this person must be finished first
 * - today must be a working day for the prospect and the sender
 * - one touch per person per day, plus the weekly person and account caps
 * Later steps stay where they are: pulling a step earlier only widens the gap.
 */

export type PullInput = {
  step: { id: string; sequenceNo: number; dueDate: IsoDate | null; contactId: string; accountId: string; assigneeId: string; channel: string; country: string | null };
  today: IsoDate;
  /** Sequence numbers of the other still-open steps on the same track. */
  openSequenceNos: readonly number[];
  /** Everything else already scheduled or done this week, the step itself excluded. */
  existing: readonly Touch[];
  caps: Caps;
  ctx: CalendarContext;
};

export function pullForwardBlock(i: PullInput): string | null {
  const { step, today } = i;
  if (!step.dueDate) return "This step waits on a trigger, so it can't be pulled forward";
  if (step.dueDate <= today) return "This step is already due";
  const earlier = i.openSequenceNos.filter((n) => n < step.sequenceNo).sort((a, b) => a - b);
  if (earlier.length) return `Step ${earlier[0]} for this person isn't done yet`;
  const off = invalidReasons(today, { country: step.country, assigneeId: step.assigneeId }, i.ctx);
  if (off.length) return `Today is a day off here (${reasonCopy(off).join(", ")})`;
  const touch: Touch = { key: step.id, date: today, contactId: step.contactId, accountId: step.accountId, assigneeId: step.assigneeId, channel: step.channel, country: step.country };
  const { scheduled } = scheduleTouches([touch], i.existing.filter((t) => t.key !== step.id), i.caps, i.ctx);
  const placed = scheduled[0];
  if (placed.date !== today) return `Can't do it today: ${placed.reasons.map((r) => MOVE_REASON_COPY[r]).join(", ")}`;
  return null;
}
