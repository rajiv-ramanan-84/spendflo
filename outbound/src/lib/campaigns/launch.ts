import type { IsoDate } from "@/lib/calendar/dates";
import { addWorkingDays, nextValidDate, type CalendarContext, type DateScope } from "@/lib/calendar/working-calendar";

/**
 * Launch rules (PRD M3, M4, section 7). Pure.
 * - Every review flag must be resolved or dismissed first.
 * - Launching keeps each step's working-day date. A draft that sat for a
 *   few days has steps in the past: those move to today or later, keeping
 *   the order and the minimum gap, and say so.
 */

export type ReviewFlag = { id: string; text: string; contactId?: string; sequenceNo?: number };

export function openFlags(flags: readonly ReviewFlag[], cleared: readonly string[]): ReviewFlag[] {
  const done = new Set(cleared);
  return flags.filter((f) => !done.has(f.id));
}

export function canLaunch(flags: readonly ReviewFlag[], cleared: readonly string[], datedSteps: number): { ok: boolean; reason: string | null } {
  const open = openFlags(flags, cleared);
  if (open.length) return { ok: false, reason: `${open.length} review flag${open.length > 1 ? "s" : ""} to resolve or dismiss` };
  if (datedSteps === 0) return { ok: false, reason: "No dated steps yet. Add a step or a fixed start to at least one track" };
  return { ok: true, reason: null };
}

export type RebaseStep = { id: string; date: IsoDate };

/** Moves past-dated steps of one track to valid dates from `today`, keeping order and gaps. */
export function rebaseTrack(steps: readonly RebaseStep[], today: IsoDate, scope: DateScope, ctx: CalendarContext, minGap = 2): Array<RebaseStep & { movedFrom: IsoDate | null }> {
  const out: Array<RebaseStep & { movedFrom: IsoDate | null }> = [];
  let prev: IsoDate | null = null;
  for (const s of [...steps].sort((a, b) => a.date.localeCompare(b.date))) {
    let date = s.date < today ? nextValidDate(today, scope, ctx) : s.date;
    if (prev) {
      const earliest = addWorkingDays(prev, minGap, scope, ctx);
      if (date < earliest) date = earliest;
    }
    out.push({ ...s, date, movedFrom: date !== s.date ? s.date : null });
    prev = date;
  }
  return out;
}

/** Status a step shows on a given day (the daily job stores the same). */
export function stepStatusOn(today: IsoDate, step: { status: string; due_date: string | null }): string {
  if (["done", "skipped", "superseded"].includes(step.status) || !step.due_date) return step.status;
  if (step.due_date < today) return "overdue";
  if (step.due_date === today) return "due";
  return "upcoming";
}
