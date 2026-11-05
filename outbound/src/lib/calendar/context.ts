import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IsoDate } from "./dates";
import { prospectHolidayLookup } from "./holidays";
import type { CalendarContext, DateRange, QuietPeriod } from "./working-calendar";

/**
 * Builds the working calendar from the database: holidays (admins edit them in
 * Settings), out-of-office per user, and quiet periods from app_settings.
 * The US calendar comes from the holidays table so admin edits win; other
 * countries come from date-holidays plus any rows added for that country.
 */
export async function loadCalendarContext(db: SupabaseClient, years: number[]): Promise<CalendarContext> {
  const from = `${Math.min(...years)}-01-01`;
  const to = `${Math.max(...years)}-12-31`;

  const [holidays, ooo, settings] = await Promise.all([
    db.from("holidays").select("calendar, date").is("deleted_at", null).gte("date", from).lte("date", to),
    db.from("user_out_of_office").select("user_id, start_date, end_date").is("deleted_at", null).gte("end_date", from),
    db.from("app_settings").select("quiet_periods").single(),
  ]);
  for (const r of [holidays, ooo, settings]) if (r.error) throw new Error(`Calendar load failed: ${r.error.message}`);

  const byCalendar = new Map<string, IsoDate[]>();
  for (const h of holidays.data ?? []) {
    const list = byCalendar.get(h.calendar) ?? [];
    list.push(h.date);
    byCalendar.set(h.calendar, list);
  }

  const fallback = prospectHolidayLookup(years, Object.fromEntries([...byCalendar].filter(([c]) => c !== "US" && c !== "IN_TEAM")));
  const us = new Set(byCalendar.get("US") ?? []);
  const prospectHolidays = (country: string) => (country.toUpperCase() === "US" ? us : fallback(country));

  const outOfOffice = new Map<string, DateRange[]>();
  for (const o of ooo.data ?? []) {
    const list = outOfOffice.get(o.user_id) ?? [];
    list.push({ start: o.start_date, end: o.end_date });
    outOfOffice.set(o.user_id, list);
  }

  return {
    prospectHolidays,
    teamHolidays: new Set(byCalendar.get("IN_TEAM") ?? []),
    outOfOffice,
    quietPeriods: (settings.data?.quiet_periods ?? []) as QuietPeriod[],
  };
}
