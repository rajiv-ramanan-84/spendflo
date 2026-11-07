import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { addDays } from "@/lib/calendar/dates";
import { firstName, fmtDate } from "@/lib/format";
import type { Projection } from "@/lib/campaigns/projection";
import type { CockpitTrack } from "@/lib/data/queries";
import { cn } from "@/lib/cn";

/**
 * Every planned touch at the account on one strip, by week, one colour per
 * person, so clashes, gaps and the account's weekly cap are visible at a glance.
 * Projected touches (tracks waiting on a trigger) are dashed.
 */
const COLORS = ["bg-brand-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-400", "bg-teal-500", "bg-orange-500"];
const OPEN = ["upcoming", "due", "overdue"];

function mondayOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function AccountTimeline({ tracks, names, projections, today, weeklyCap }: { tracks: CockpitTrack[]; names: Map<string, string>; projections: Projection[]; today: string; weeklyCap: number }) {
  const proj = new Map(projections.map((p) => [p.trackId, p]));
  const colorOf = new Map(tracks.map((t, i) => [t.contact_id, COLORS[i % COLORS.length]]));
  type Touch = { date: string; contactId: string; projected: boolean };
  const touches: Touch[] = [];
  for (const t of tracks) {
    const p = proj.get(t.id);
    for (const s of t.steps) {
      if (!OPEN.includes(s.status)) continue;
      const date = s.due_date ?? (p?.kind === "projected" ? p.dates[s.id] : undefined);
      if (date && date >= addDays(today, -7)) touches.push({ date, contactId: t.contact_id, projected: !s.due_date });
    }
  }
  if (!touches.length) return null;

  const start = mondayOf(today);
  const weeks = Array.from({ length: 5 }, (_, i) => addDays(start, i * 7));
  const days = (w: string) => Array.from({ length: 5 }, (_, i) => addDays(w, i));
  const later = touches.filter((t) => t.date >= addDays(start, 35)).length;

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><CalendarDays size={18} className="text-brand-500" /><h2 className="text-[15px] font-semibold">Account timeline</h2></div>
        <div className="flex flex-wrap gap-3 text-xs text-ink-500">
          {tracks.map((t) => <span key={t.id} className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-full", colorOf.get(t.contact_id))} />{firstName(names.get(t.contact_id) ?? "")}</span>)}
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-ink-400" />projected</span>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead><tr className="text-ink-400">{["Week of", "Mon", "Tue", "Wed", "Thu", "Fri", "Touches"].map((h) => <th key={h} className="pb-2 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {weeks.map((w) => {
              const inWeek = touches.filter((t) => t.date >= w && t.date < addDays(w, 7));
              const over = inWeek.length > weeklyCap;
              return (
                <tr key={w}>
                  <td className="py-2 pr-3 text-ink-500">{fmtDate(w)}</td>
                  {days(w).map((d) => {
                    const here = inWeek.filter((t) => t.date === d);
                    const people = new Set(here.map((h) => h.contactId));
                    return (
                      <td key={d} className={cn("py-2 pr-2", d === today && "rounded-md bg-brand-50/60")}>
                        <div className="flex flex-wrap gap-1" title={here.map((h) => `${names.get(h.contactId)}${h.projected ? " (projected)" : ""}`).join(", ")}>
                          {here.map((h, i) => <span key={i} className={cn("grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white", colorOf.get(h.contactId), h.projected && "opacity-60 ring-1 ring-dashed ring-ink-400")}>{(names.get(h.contactId) ?? "?")[0]}</span>)}
                          {people.size > 1 ? <span className="self-center text-[10px] font-medium text-amber-700">{people.size} people</span> : null}
                        </div>
                      </td>
                    );
                  })}
                  <td className={cn("py-2 font-semibold tabular-nums", over ? "text-amber-700" : "text-ink-700")}>{inWeek.length} of {weeklyCap}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {later ? <p className="mt-2 text-xs text-ink-400">{later} more touch{later === 1 ? "" : "es"} after these five weeks.</p> : null}
    </Card>
  );
}
