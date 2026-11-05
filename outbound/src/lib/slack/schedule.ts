import type { IsoDate } from "@/lib/calendar/dates";
import { invalidReasons, type CalendarContext } from "@/lib/calendar/working-calendar";

/**
 * Whether the team's morning post goes out today. The team follows the US
 * federal calendar, so weekends, US holidays (and any extra company days) and
 * quiet periods skip it. A holiday in another prospect country does not.
 */
export function teamDayOff(today: IsoDate, ctx: CalendarContext) {
  return invalidReasons(today, {}, ctx).filter((r) => r !== "prospect_holiday");
}

/** "08:30" style comparison in the team's time zone. */
export function isPastPostTime(now: Date, postTime: string, timeZone: string) {
  const local = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return local >= postTime;
}
