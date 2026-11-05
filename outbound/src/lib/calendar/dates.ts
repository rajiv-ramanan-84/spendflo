/**
 * ISO calendar dates ("YYYY-MM-DD") with no time zone. All arithmetic in UTC
 * so a date never drifts a day because of where the server runs.
 */
export type IsoDate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function assertIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) throw new Error(`Not a valid ISO date: ${value}`);
  return value;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(date: IsoDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isWeekend(date: IsoDate): boolean {
  const dow = dayOfWeek(date);
  return dow === 0 || dow === 6;
}

/** Today's date in a given IANA time zone (default IST, the team's home). */
export function todayIn(timeZone = "Asia/Kolkata", now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function inRange(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return date >= start && date <= end;
}
