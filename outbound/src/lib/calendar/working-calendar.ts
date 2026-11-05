import { addDays, assertIsoDate, inRange, isWeekend, type IsoDate } from "./dates";

/**
 * The working calendar (PRD M4). Pure functions, no I/O.
 *
 * A date is valid for a step when it is a working day on the prospect's
 * calendar AND on the Spendflo team calendar AND the assignee is not out of
 * office AND it is not inside an enabled quiet period. Every gap is counted in
 * these valid days. Nothing is ever scheduled on a weekend or holiday.
 */

export type DateRange = { start: IsoDate; end: IsoDate };
export type QuietPeriod = DateRange & { name?: string; enabled: boolean };

export type CalendarContext = {
  /** Holiday dates for a prospect country (ISO code). Unknown country falls back to weekends only. */
  prospectHolidays: (country: string) => ReadonlySet<IsoDate>;
  /** Spendflo company holidays (India). */
  teamHolidays: ReadonlySet<IsoDate>;
  /** Out-of-office ranges per user id, inclusive. */
  outOfOffice: ReadonlyMap<string, readonly DateRange[]>;
  quietPeriods: readonly QuietPeriod[];
};

export type DateScope = {
  /** Prospect country, default US (all current accounts are US HQ). */
  country?: string | null;
  /** Assignee user id. Omit to check prospect and team calendars only. */
  assigneeId?: string | null;
};

export type InvalidReason = "weekend" | "prospect_holiday" | "team_holiday" | "quiet_period" | "assignee_out_of_office";

/** Guard: no realistic calendar has a year without a valid day. */
const MAX_SCAN_DAYS = 366;

function countryOf(scope: DateScope) {
  return (scope.country || "US").toUpperCase();
}

export function invalidReasons(date: IsoDate, scope: DateScope, ctx: CalendarContext): InvalidReason[] {
  assertIsoDate(date);
  const reasons: InvalidReason[] = [];
  if (isWeekend(date)) reasons.push("weekend");
  if (ctx.prospectHolidays(countryOf(scope)).has(date)) reasons.push("prospect_holiday");
  if (ctx.teamHolidays.has(date)) reasons.push("team_holiday");
  if (ctx.quietPeriods.some((q) => q.enabled && inRange(date, q.start, q.end))) reasons.push("quiet_period");
  if (scope.assigneeId) {
    const ooo = ctx.outOfOffice.get(scope.assigneeId) ?? [];
    if (ooo.some((r) => inRange(date, r.start, r.end))) reasons.push("assignee_out_of_office");
  }
  return reasons;
}

export function isValidDate(date: IsoDate, scope: DateScope, ctx: CalendarContext): boolean {
  return invalidReasons(date, scope, ctx).length === 0;
}

/** The first valid date on or after `date`. */
export function nextValidDate(date: IsoDate, scope: DateScope, ctx: CalendarContext): IsoDate {
  let d = assertIsoDate(date);
  for (let i = 0; i <= MAX_SCAN_DAYS; i++) {
    if (isValidDate(d, scope, ctx)) return d;
    d = addDays(d, 1);
  }
  throw new Error(`No valid working day within ${MAX_SCAN_DAYS} days of ${date}`);
}

export type RolledDate = {
  date: IsoDate;
  /** Set when the date had to move; drives the small "moved from" note on the step. */
  movedFrom: IsoDate | null;
  reasons: InvalidReason[];
};

/** Validate a proposed date (from Claude or a person). Invalid dates roll forward. */
export function rollForward(date: IsoDate, scope: DateScope, ctx: CalendarContext): RolledDate {
  const reasons = invalidReasons(date, scope, ctx);
  if (reasons.length === 0) return { date, movedFrom: null, reasons };
  return { date: nextValidDate(date, scope, ctx), movedFrom: date, reasons };
}

/**
 * The date `n` working days after `date` (the start itself is not counted).
 * n = 0 returns the next valid date on or after `date`.
 * "2 days after a reply" = addWorkingDays(replyDate, 2).
 */
export function addWorkingDays(date: IsoDate, n: number, scope: DateScope, ctx: CalendarContext): IsoDate {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Working-day offset must be a non-negative integer, got ${n}`);
  if (n === 0) return nextValidDate(date, scope, ctx);
  let d = assertIsoDate(date);
  let counted = 0;
  let sinceLastValid = 0;
  while (counted < n) {
    d = addDays(d, 1);
    if (isValidDate(d, scope, ctx)) {
      counted++;
      sinceLastValid = 0;
    } else if (++sinceLastValid > MAX_SCAN_DAYS) {
      throw new Error(`Could not find ${n} working days after ${date}`);
    }
  }
  return d;
}

/** The next `count` valid dates starting on `start` (inclusive). Sent to Claude as valid_working_dates. */
export function listValidDates(start: IsoDate, count: number, scope: DateScope, ctx: CalendarContext): IsoDate[] {
  const out: IsoDate[] = [];
  let d = nextValidDate(start, scope, ctx);
  while (out.length < count) {
    out.push(d);
    d = addWorkingDays(d, 1, scope, ctx);
  }
  return out;
}

/** Valid days d with from <= d < to. Used for pause and resume. */
export function workingDaysBetween(from: IsoDate, to: IsoDate, scope: DateScope, ctx: CalendarContext): number {
  assertIsoDate(from);
  assertIsoDate(to);
  let n = 0;
  for (let d = from; d < to; d = addDays(d, 1)) if (isValidDate(d, scope, ctx)) n++;
  return n;
}

/** Default campaign start: the next working day after today. */
export function defaultCampaignStart(today: IsoDate, ctx: CalendarContext): IsoDate {
  return addWorkingDays(today, 1, {}, ctx);
}

/**
 * Resume after a pause: every remaining step moves forward by the working days
 * lost while paused, keeping its spacing. Each step is validated for its own
 * contact and assignee.
 */
export function shiftForResume<T extends { date: IsoDate; scope: DateScope }>(
  steps: readonly T[],
  pausedOn: IsoDate,
  resumedOn: IsoDate,
  ctx: CalendarContext,
): Array<T & { newDate: IsoDate }> {
  const lost = workingDaysBetween(pausedOn, resumedOn, {}, ctx);
  return steps.map((s) => ({ ...s, newDate: addWorkingDays(s.date, lost, s.scope, ctx) }));
}

/** Snooze offers +1, +2 or +3 working days. */
export function snooze(date: IsoDate, days: 1 | 2 | 3, scope: DateScope, ctx: CalendarContext): IsoDate {
  return addWorkingDays(date, days, scope, ctx);
}

/** Small helper so the UI and Slack can say why a date moved. */
export const INVALID_REASON_COPY: Record<InvalidReason, string> = {
  weekend: "weekend",
  prospect_holiday: "prospect holiday",
  team_holiday: "team holiday",
  quiet_period: "quiet period",
  assignee_out_of_office: "sender out of office",
};
