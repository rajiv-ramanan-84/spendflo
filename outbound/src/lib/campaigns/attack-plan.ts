import type { Projection } from "./projection";

/**
 * The account attack plan, read from the campaign itself (dates and triggers),
 * so it never drifts from what will actually happen. Pure.
 *
 * Waves:
 *  1 Open      fixed-start tracks whose first touch lands in the opening week
 *  2 Expand    later fixed starts, and tracks that start after another person's step
 *  3 Escalate  tracks that start only when someone replies
 * Nurture: people held back on purpose (no touches until someone promotes them).
 */

export const DEFAULT_ACTIVE_CAP = 6;
/** One colour per person, shared by the plan and the timeline. */
export const PERSON_COLORS = ["bg-brand-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-400", "bg-teal-500", "bg-orange-500"];
/** Above this many people found, the plan recommends 4 to 6 active and the rest in nurture. */
export const LARGE_COMMITTEE = 10;

export type PlanStep = { id: string; sequence_no: number; channel: string; status: string; due_date: string | null; completed_at: string | null };
export type PlanTrack = {
  id: string; contact_id: string; persona: string | null; status: string; pause_reason?: string | null; track_goal?: string | null;
  start_trigger_type: string; trigger_from_contact_id: string | null; steps: PlanStep[];
};
export type PlanContact = { id: string; full_name: string; title: string | null; persona: string | null; exclude: boolean; do_not_contact: boolean; sheet_deleted_at: string | null };

export type PlanPerson = {
  contactId: string; trackId: string; name: string; title: string | null; persona: string | null;
  wave: 1 | 2 | 3; firstTouch: string | null; projected: boolean; channels: string[]; steps: number; done: number;
  status: string; waitsOn: string | null; unlocks: string[]; basis: string | null;
};
export type NurturePerson = { contactId: string; trackId: string | null; name: string; title: string | null; persona: string | null; reason: string | null; hasSteps: boolean };

export type AttackPlan = {
  waves: Array<{ wave: 1 | 2 | 3; label: string; hint: string; from: string | null; people: PlanPerson[] }>;
  active: PlanPerson[];
  nurture: NurturePerson[];
  outside: Array<{ contactId: string; name: string; title: string | null; why: string }>;
  coverage: Array<{ role: string; covered: boolean; by: string[] }>;
  found: number;
  cap: number;
  advice: string | null;
};

const OPEN = ["upcoming", "due", "overdue"];
const ENDED = ["stopped", "completed"];

export const ROLES: Array<{ role: string; personas: string[] }> = [
  { role: "Economic buyer", personas: ["economic_buyer"] },
  { role: "Procurement leader", personas: ["procurement_leader"] },
  { role: "System owner", personas: ["system_owner"] },
  { role: "Legal or contracts", personas: ["legal", "contract_manager"] },
  { role: "Finance or AP", personas: ["finance_ap"] },
  { role: "Champion", personas: ["champion"] },
];

function addCalendarDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildAttackPlan(input: {
  tracks: readonly PlanTrack[];
  contacts: readonly PlanContact[];
  projections: readonly Projection[];
  skipped?: ReadonlyArray<{ contactRef: string; reason: string }>;
  cap?: number;
}): AttackPlan {
  const cap = input.cap ?? DEFAULT_ACTIVE_CAP;
  const contactOf = new Map(input.contacts.map((c) => [c.id, c]));
  const proj = new Map(input.projections.map((p) => [p.trackId, p]));
  const name = (id: string | null) => (id ? contactOf.get(id)?.full_name ?? "another contact" : "another contact");
  const first = (full: string) => full.split(/\s+/)[0];

  const people: PlanPerson[] = [];
  for (const t of input.tracks) {
    if (t.status === "nurture") continue;
    const c = contactOf.get(t.contact_id);
    if (!c) continue;
    const p = proj.get(t.id);
    const steps = [...t.steps].sort((a, b) => a.sequence_no - b.sequence_no);
    const dates = steps.map((s) => (s.status === "done" ? s.completed_at?.slice(0, 10) : s.due_date ?? (p?.kind === "projected" ? p.dates[s.id] : null)) ?? null).filter(Boolean) as string[];
    const firstTouch = dates.length ? dates.sort()[0] : null;
    const channels = [...new Set(steps.filter((s) => s.status !== "skipped").map((s) => s.channel))];
    people.push({
      contactId: c.id, trackId: t.id, name: c.full_name, title: c.title, persona: t.persona ?? c.persona,
      wave: 1, firstTouch, projected: !steps.some((s) => s.due_date || s.status === "done") && !!firstTouch,
      channels, steps: steps.filter((s) => s.status !== "skipped").length, done: steps.filter((s) => s.status === "done").length,
      status: t.status, waitsOn: t.start_trigger_type === "fixed" ? null : first(name(t.trigger_from_contact_id)),
      unlocks: [], basis: p?.kind === "stuck" ? `Stuck: ${p.reason}` : p ? p.basis : null,
    });
  }
  for (const t of input.tracks) {
    if (t.status === "nurture" || t.start_trigger_type === "fixed" || !t.trigger_from_contact_id) continue;
    const src = people.find((x) => x.contactId === t.trigger_from_contact_id);
    const me = contactOf.get(t.contact_id);
    if (src && me) src.unlocks.push(first(me.full_name));
  }

  // Wave by how and when each person starts.
  const fixed = people.filter((p) => input.tracks.find((t) => t.id === p.trackId)?.start_trigger_type === "fixed" && p.firstTouch);
  const opening = fixed.map((p) => p.firstTouch!).sort()[0] ?? null;
  for (const p of people) {
    const trig = input.tracks.find((t) => t.id === p.trackId)!.start_trigger_type;
    if (trig === "after_reply" || !p.firstTouch) p.wave = 3;
    else if (trig === "fixed" && opening && p.firstTouch <= addCalendarDays(opening, 6)) p.wave = 1;
    else p.wave = 2;
  }
  const byFirst = (a: PlanPerson, b: PlanPerson) => a.wave - b.wave || (a.firstTouch ?? "9999").localeCompare(b.firstTouch ?? "9999") || a.name.localeCompare(b.name);
  people.sort(byFirst);
  const active = people.filter((p) => !ENDED.includes(p.status));

  const META = {
    1: { label: "Wave 1 · Open", hint: "First touches, the opening week" },
    2: { label: "Wave 2 · Expand", hint: "Later starts and follow-on contacts" },
    3: { label: "Wave 3 · Escalate", hint: "Starts on a reply, or has no date yet" },
  } as const;
  const waves = ([1, 2, 3] as const).map((w) => {
    const ps = people.filter((p) => p.wave === w);
    return { wave: w, label: META[w].label, hint: META[w].hint, from: ps.map((p) => p.firstTouch).filter(Boolean).sort()[0] ?? null, people: ps };
  });

  // Nurture: parked tracks, plus people Claude chose to hold back (with its reason).
  const inPlan = new Set(people.map((p) => p.contactId));
  const reasonOf = new Map((input.skipped ?? []).map((s) => [s.contactRef, s.reason]));
  const nurture: NurturePerson[] = [];
  const outside: AttackPlan["outside"] = [];
  for (const t of input.tracks.filter((x) => x.status === "nurture")) {
    const c = contactOf.get(t.contact_id);
    if (c) nurture.push({ contactId: c.id, trackId: t.id, name: c.full_name, title: c.title, persona: t.persona ?? c.persona, reason: t.pause_reason ?? reasonOf.get(c.id) ?? null, hasSteps: t.steps.some((s) => OPEN.includes(s.status)) });
  }
  const nurtured = new Set(nurture.map((n) => n.contactId));
  for (const c of input.contacts) {
    if (inPlan.has(c.id) || nurtured.has(c.id)) continue;
    if (c.exclude || c.do_not_contact || c.sheet_deleted_at) { outside.push({ contactId: c.id, name: c.full_name, title: c.title, why: c.do_not_contact ? "Do not contact" : c.sheet_deleted_at ? "Removed from the sheet" : "Excluded" }); continue; }
    nurture.push({ contactId: c.id, trackId: null, name: c.full_name, title: c.title, persona: c.persona, reason: reasonOf.get(c.id) ?? null, hasSteps: false });
  }

  const coverage = ROLES.map((r) => {
    const by = active.filter((p) => p.persona && r.personas.includes(p.persona)).map((p) => first(p.name));
    return { role: r.role, covered: by.length > 0, by };
  });
  const found = active.length + nurture.length;
  const advice = active.length > cap
    ? `${active.length} people are active. Keep ${cap} at most: move the rest to nurture so each gets a real sequence.`
    : found > LARGE_COMMITTEE
      ? `${found} stakeholders found. Best practice is 4 to 6 active per use case; the others wait in nurture until a reply, a referral or a signal pulls them in.`
      : null;

  return { waves, active, nurture, outside, coverage, found, cap, advice };
}

/** Overflow rule for new drafts: keep the first `cap` tracks to start, the rest go to nurture. Sources of a kept trigger always stay. */
export function overflowToNurture<T extends { contactId: string; trigger: { type: string; startDate: string | null; fromContactId: string | null }; steps: Array<{ date: string | null }> }>(tracks: readonly T[], cap: number): { keep: T[]; nurture: T[] } {
  if (tracks.length <= cap) return { keep: [...tracks], nurture: [] };
  const firstDate = (t: T) => t.steps.map((s) => s.date).filter(Boolean).sort()[0] ?? "9999-12-31";
  const rank = (t: T) => (t.trigger.type === "fixed" ? 0 : t.trigger.type === "after_step" ? 1 : 2);
  const ordered = tracks.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || firstDate(a.t).localeCompare(firstDate(b.t)) || a.i - b.i);
  const keep = new Set(ordered.slice(0, cap).map((x) => x.t.contactId));
  // A kept track that waits on someone needs that someone kept too.
  for (const x of ordered) {
    if (!keep.has(x.t.contactId) || !x.t.trigger.fromContactId || keep.has(x.t.trigger.fromContactId)) continue;
    keep.delete(x.t.contactId);
  }
  return { keep: tracks.filter((t) => keep.has(t.contactId)), nurture: tracks.filter((t) => !keep.has(t.contactId)) };
}
