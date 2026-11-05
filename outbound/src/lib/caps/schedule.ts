import { addDays, dayOfWeek, type IsoDate } from "@/lib/calendar/dates";
import { addWorkingDays, nextValidDate, type CalendarContext, type DateScope } from "@/lib/calendar/working-calendar";

/**
 * Caps and the collision guard (PRD section 11). Pure functions.
 *
 * Hard rules, applied by moving a step forward to the next working day:
 * - one touch per contact per day across the whole team
 * - steps per person per day (default 25)
 * - touches per contact per week (default 3)
 * - touches per account per week (default 6)
 * - LinkedIn connect requests per person per week (default 80)
 * Every move is recorded so the step can show "moved from".
 */

export type Caps = {
  touches_per_contact_per_day: number;
  touches_per_contact_per_week: number;
  touches_per_account_per_week: number;
  steps_per_person_per_day: number;
  linkedin_connects_per_person_per_week: number;
  linkedin_connect_warn_ratio: number;
};

export const DEFAULT_CAPS: Caps = {
  touches_per_contact_per_day: 1,
  touches_per_contact_per_week: 3,
  touches_per_account_per_week: 6,
  steps_per_person_per_day: 25,
  linkedin_connects_per_person_per_week: 80,
  linkedin_connect_warn_ratio: 0.8,
};

export type Touch = {
  key: string;
  date: IsoDate;
  contactId: string;
  accountId: string;
  assigneeId: string;
  channel: string;
  country?: string | null;
};

export type MoveReason =
  | "contact_already_touched_that_day"
  | "assignee_daily_cap"
  | "contact_weekly_cap"
  | "account_weekly_cap"
  | "linkedin_weekly_cap";

export type ScheduledTouch = Touch & { movedFrom: IsoDate | null; reasons: MoveReason[] };

export type CapWarning = { assigneeId: string; week: IsoDate; connects: number; cap: number };

/** Monday of the week containing `date`. */
export function weekStart(date: IsoDate): IsoDate {
  const dow = dayOfWeek(date); // 0 Sun .. 6 Sat
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

class Ledger {
  private m = new Map<string, number>();
  get(k: string) {
    return this.m.get(k) ?? 0;
  }
  add(k: string) {
    this.m.set(k, this.get(k) + 1);
  }
}

function blockers(t: Touch, date: IsoDate, l: Ledger, caps: Caps): MoveReason[] {
  const wk = weekStart(date);
  const r: MoveReason[] = [];
  if (l.get(`cd|${t.contactId}|${date}`) >= caps.touches_per_contact_per_day) r.push("contact_already_touched_that_day");
  if (l.get(`pd|${t.assigneeId}|${date}`) >= caps.steps_per_person_per_day) r.push("assignee_daily_cap");
  if (l.get(`cw|${t.contactId}|${wk}`) >= caps.touches_per_contact_per_week) r.push("contact_weekly_cap");
  if (l.get(`aw|${t.accountId}|${wk}`) >= caps.touches_per_account_per_week) r.push("account_weekly_cap");
  if (t.channel === "linkedin_connect" && l.get(`lw|${t.assigneeId}|${wk}`) >= caps.linkedin_connects_per_person_per_week) r.push("linkedin_weekly_cap");
  return r;
}

function record(t: Touch, date: IsoDate, l: Ledger) {
  const wk = weekStart(date);
  l.add(`cd|${t.contactId}|${date}`);
  l.add(`pd|${t.assigneeId}|${date}`);
  l.add(`cw|${t.contactId}|${wk}`);
  l.add(`aw|${t.accountId}|${wk}`);
  if (t.channel === "linkedin_connect") l.add(`lw|${t.assigneeId}|${wk}`);
}

/** Search limit: no realistic plan needs more than ~6 months of rolling forward. */
const MAX_ROLL_DAYS = 130;

/**
 * Places each new touch on its date or the first later working day where no
 * cap is broken, given what is already scheduled. Touches are placed in date
 * order (ties keep input order), so earlier steps keep their slots.
 */
export function scheduleTouches(
  touches: readonly Touch[],
  existing: readonly Touch[],
  caps: Caps,
  ctx: CalendarContext,
): { scheduled: ScheduledTouch[]; warnings: CapWarning[] } {
  const ledger = new Ledger();
  for (const e of existing) record(e, e.date, ledger);

  const order = touches.map((t, i) => ({ t, i })).sort((a, b) => a.t.date.localeCompare(b.t.date) || a.i - b.i);
  const out: ScheduledTouch[] = new Array(touches.length);

  for (const { t, i } of order) {
    const scope: DateScope = { country: t.country, assigneeId: t.assigneeId };
    let date = nextValidDate(t.date, scope, ctx);
    const reasons = new Set<MoveReason>();
    for (let n = 0; ; n++) {
      if (n > MAX_ROLL_DAYS) throw new Error(`Could not place step ${t.key} within ${MAX_ROLL_DAYS} working days of ${t.date}`);
      const b = blockers(t, date, ledger, caps);
      if (!b.length) break;
      b.forEach((x) => reasons.add(x));
      date = addWorkingDays(date, 1, scope, ctx);
    }
    record(t, date, ledger);
    out[i] = { ...t, date, movedFrom: date !== t.date ? t.date : null, reasons: [...reasons] };
  }

  const warnings: CapWarning[] = [];
  const seen = new Set<string>();
  for (const s of [...existing, ...out]) {
    if (s.channel !== "linkedin_connect") continue;
    const wk = weekStart(s.date);
    const k = `${s.assigneeId}|${wk}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const n = ledger.get(`lw|${s.assigneeId}|${wk}`);
    if (n >= Math.ceil(caps.linkedin_connects_per_person_per_week * caps.linkedin_connect_warn_ratio)) {
      warnings.push({ assigneeId: s.assigneeId, week: wk, connects: n, cap: caps.linkedin_connects_per_person_per_week });
    }
  }
  return { scheduled: out, warnings };
}

export const MOVE_REASON_COPY: Record<MoveReason, string> = {
  contact_already_touched_that_day: "someone already touches this contact that day",
  assignee_daily_cap: "sender's day is full",
  contact_weekly_cap: "weekly touch limit for this contact",
  account_weekly_cap: "weekly touch limit for this account",
  linkedin_weekly_cap: "weekly LinkedIn invite limit",
};
