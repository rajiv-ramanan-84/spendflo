import type { IsoDate } from "@/lib/calendar/dates";
import type { CalendarContext } from "@/lib/calendar/working-calendar";
import { datesForTriggeredTrack } from "./triggers";

/**
 * Projected dates for tracks that start on a trigger ("3 working days after
 * a step to Bobby"). Pure. Real dates are still set when the trigger fires
 * (with caps and the collision guard); this shows where they will land, and
 * flags a trigger that can no longer happen.
 */

export type PStep = { id: string; sequence_no: number; status: string; due_date: string | null; completed_at: string | null; offset_working_days: number | null };
export type PTrack = { id: string; contact_id: string; status: string; start_trigger_type: string; trigger_from_contact_id: string | null; trigger_step_index: number | null; delay_working_days: number | null; steps: PStep[] };

export type Projection =
  | { kind: "projected"; trackId: string; basis: string; triggerDate: IsoDate; dates: Record<string, IsoDate> }
  | { kind: "on_reply"; trackId: string; basis: string }
  | { kind: "stuck"; trackId: string; basis: string; reason: string };

const OPEN = ["upcoming", "due", "overdue"];
const LIVE_TRACK = ["not_started", "active"];

export function projectTriggeredTracks(tracks: readonly PTrack[], names: ReadonlyMap<string, string>, ctx: CalendarContext): Projection[] {
  const byContact = new Map(tracks.map((t) => [t.contact_id, t]));
  const out: Projection[] = [];
  for (const t of tracks) {
    if (t.start_trigger_type === "fixed" || t.status !== "not_started") continue;
    const who = names.get(t.trigger_from_contact_id ?? "") ?? "the other contact";
    const delay = t.delay_working_days ?? 2;
    const src = t.trigger_from_contact_id ? byContact.get(t.trigger_from_contact_id) : undefined;

    if (t.start_trigger_type === "after_reply") {
      if (!src || !LIVE_TRACK.includes(src.status)) {
        out.push({ kind: "stuck", trackId: t.id, basis: `waits for ${who} to reply`, reason: `${who}'s track is ${src ? src.status.replace("_", " ") : "missing"}, so a reply is unlikely to come from it` });
      } else {
        out.push({ kind: "on_reply", trackId: t.id, basis: `starts ${delay} working days after ${who} replies` });
      }
      continue;
    }

    // after_step: the named step of the other track (or its first step).
    const srcSteps = (src?.steps ?? []).slice().sort((a, b) => a.sequence_no - b.sequence_no);
    const trigger = t.trigger_step_index ? srcSteps.find((s) => s.sequence_no === t.trigger_step_index) : srcSteps[0];
    const label = `${who}'s ${trigger ? `step ${trigger.sequence_no}` : "first step"}`;
    if (!src || !trigger) {
      out.push({ kind: "stuck", trackId: t.id, basis: `waits for ${label}`, reason: `${who} has no such step` });
      continue;
    }
    if (trigger.status === "skipped" || trigger.status === "superseded" || (!LIVE_TRACK.includes(src.status) && trigger.status !== "done")) {
      out.push({ kind: "stuck", trackId: t.id, basis: `waits for ${label}`, reason: trigger.status === "skipped" ? `${label} was skipped` : trigger.status === "superseded" ? `${label} was replaced in a re-plan` : `${who}'s track is ${src.status.replace("_", " ")}` });
      continue;
    }
    const triggerDate = (trigger.status === "done" ? trigger.completed_at?.slice(0, 10) : trigger.due_date) ?? null;
    if (!triggerDate) {
      out.push({ kind: "stuck", trackId: t.id, basis: `waits for ${label}`, reason: `${label} has no date yet` });
      continue;
    }
    const open = t.steps.filter((s) => OPEN.includes(s.status));
    const planned = datesForTriggeredTrack(open.map((s) => ({ id: s.id, offset: s.offset_working_days ?? 0 })), triggerDate as IsoDate, delay, {}, ctx);
    out.push({
      kind: "projected", trackId: t.id, triggerDate: triggerDate as IsoDate,
      basis: `${delay} working days after ${label} (${trigger.status === "done" ? "sent" : "due"} ${triggerDate})`,
      dates: Object.fromEntries(planned.steps.map((s) => [s.id, s.date])),
    });
  }
  return out;
}
