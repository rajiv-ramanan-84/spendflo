import Holidays from "date-holidays";
import type { IsoDate } from "./dates";

export type HolidayEntry = { date: IsoDate; name: string };

/**
 * Public holidays for a country, including observed substitute days
 * (for example 3 Jul 2026 for Independence Day). For the US this is exactly
 * the federal list.
 */
export function publicHolidays(country: string, years: number[]): HolidayEntry[] {
  const h = new Holidays(country.toUpperCase());
  const seen = new Map<IsoDate, string>();
  for (const year of years) {
    for (const x of h.getHolidays(year) || []) {
      if (x.type !== "public") continue;
      const date = x.date.slice(0, 10);
      if (!seen.has(date)) seen.set(date, x.name);
    }
  }
  return [...seen].map(([date, name]) => ({ date, name })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Cached prospect-holiday lookup by country for a set of years. */
export function prospectHolidayLookup(years: number[], overrides: Record<string, IsoDate[]> = {}) {
  const cache = new Map<string, Set<IsoDate>>();
  return (country: string): ReadonlySet<IsoDate> => {
    const key = country.toUpperCase();
    let set = cache.get(key);
    if (!set) {
      let base: HolidayEntry[] = [];
      try {
        base = publicHolidays(key, years);
      } catch {
        base = []; // unknown country: weekends only
      }
      set = new Set([...base.map((b) => b.date), ...(overrides[key] ?? [])]);
      cache.set(key, set);
    }
    return set;
  };
}
