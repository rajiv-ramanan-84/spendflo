"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus } from "lucide-react";
import type { Projection } from "@/lib/campaigns/projection";
import type { CockpitStep, CockpitTrack, UserLite } from "@/lib/data/queries";
import { stepStatusOn } from "@/lib/campaigns/launch";
import { fmtDate, firstName, PERSONA_LABEL, TRACK_STATUS_LABEL } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { EngagementChip, type EngagementStatus } from "@/components/ui/chip";
import { Avatar } from "@/components/ui/avatar";
import { ChannelIcon } from "@/components/ui/channel";
import { StepEditor } from "./step-editor";
import { cn } from "@/lib/cn";

type Contact = {
  id: string;
  full_name: string;
  title: string | null;
  persona: string | null;
  email: string | null;
  linkedin_url: string | null;
  engagement_status: string;
  exclude: boolean;
  do_not_contact: boolean;
  bounced: boolean;
  changed_flag: boolean;
  sheet_deleted_at: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-800",
  due: "border-brand-300 bg-brand-50 text-brand-700 ring-2 ring-brand-100",
  overdue: "border-amber-300 bg-amber-50 text-amber-800",
  upcoming: "border-line bg-white text-ink-700",
  skipped: "border-line bg-canvas text-ink-400 line-through",
};

export function ContactRows(props: {
  today: string;
  contacts: Contact[];
  tracks: CockpitTrack[];
  users: UserLite[];
  campaignStatus: string | null;
  canEdit: boolean;
  projections?: Projection[];
  /** Wave order from the attack plan: who gets reached first sits on top. */
  groups?: Array<{ key: string; label: string; hint?: string; contactIds: string[]; collapsed?: boolean }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ step: CockpitStep | null; track: CockpitTrack } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set((props.groups ?? []).filter((g) => !g.collapsed).map((g) => g.key)));
  const projOf = new Map((props.projections ?? []).map((p) => [p.trackId, p]));

  async function startNow(trackId: string) {
    setStartError(null);
    const res = await fetch(`/api/tracks/${trackId}/pin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startDate: props.today }) });
    const data = await res.json().catch(() => ({ ok: false, error: "No response" }));
    if (!data.ok) return setStartError(data.error);
    router.refresh();
  }
  const trackOf = new Map(props.tracks.map((t) => [t.contact_id, t]));
  const nameOf = new Map(props.contacts.map((c) => [c.id, c.full_name]));
  const userIdx = new Map(props.users.map((u, i) => [u.id, { u, i }]));

  // Contacts with a track first (in plan order), then the rest.
  const ordered = [
    ...props.tracks.map((t) => props.contacts.find((c) => c.id === t.contact_id)).filter((c): c is Contact => !!c),
    ...props.contacts.filter((c) => !trackOf.has(c.id)),
  ];

  function renderRow(c: Contact) {
          const t = trackOf.get(c.id);
          const assignee = t?.assignee_id ? userIdx.get(t.assignee_id) : undefined;
          const blocked = c.exclude || c.do_not_contact || !!c.sheet_deleted_at;
          const engagement = (blocked ? "stopped" : c.engagement_status) as EngagementStatus;
          return (
            <div key={c.id} className={cn("grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,280px)_1fr]", blocked && "opacity-60")}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{c.full_name}</span>
                  {assignee ? <Avatar name={assignee.u.name} index={assignee.i} size={20} title={`Sent by ${assignee.u.name}`} /> : null}
                </div>
                <div className="truncate text-xs text-ink-500">{c.title}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <EngagementChip status={engagement} />
                  {c.persona ? <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-500 border border-line">{PERSONA_LABEL[c.persona] ?? c.persona}</span> : null}
                  {c.changed_flag ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Contact changed</span> : null}
                  {c.bounced ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Email bounced</span> : null}
                </div>
              </div>

              <div className="min-w-0">
                {t ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      {t.status === "paused" ? (
                        <span className="rounded-full bg-canvas px-2 py-0.5 font-medium text-ink-700 ring-1 ring-line">Paused{t.pause_reason ? `: ${t.pause_reason}` : ""}</span>
                      ) : t.status === "replied" || t.status === "meeting" ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">{TRACK_STATUS_LABEL[t.status]}</span>
                      ) : <span className="font-medium text-ink-700">{TRACK_STATUS_LABEL[t.status] ?? t.status}</span>}
                      {t.start_trigger_type !== "fixed" ? (
                        <span>
                          · {projOf.get(t.id) ? `Starts ${projOf.get(t.id)!.basis.replace(/^starts |^waits for /, (m) => (m === "waits for " ? "after " : ""))}` : <>Starts {t.delay_working_days ?? 2} working days after{" "}
                          {t.start_trigger_type === "after_reply" ? `${firstName(nameOf.get(t.trigger_from_contact_id ?? "") ?? "a contact")} replies` : `a step to ${firstName(nameOf.get(t.trigger_from_contact_id ?? "") ?? "a contact")}`}</>}
                        </span>
                      ) : null}
                      {t.track_goal ? <span className="hidden md:inline">· {t.track_goal}</span> : null}
                    </div>
                    {projOf.get(t.id)?.kind === "stuck" ? (
                      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <AlertTriangle size={14} /> Waiting on something that won&apos;t happen: {(projOf.get(t.id) as Extract<Projection, { kind: "stuck" }>).reason}.
                        {props.canEdit ? <button onClick={() => startNow(t.id)} className="ml-auto rounded-md bg-white px-2 py-1 font-medium text-ink-900 shadow-sm hover:bg-canvas">Start now</button> : null}
                      </div>
                    ) : null}
                    <div className={cn("flex flex-wrap items-center gap-2", t.status === "paused" && "opacity-50")}>
                      {t.steps.map((s) => {
                        const st = stepStatusOn(props.today, s);
                        const proj = projOf.get(t.id);
                        const projected = !s.due_date && proj?.kind === "projected" ? proj.dates[s.id] : null;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setEditing({ step: s, track: t })}
                            title={s.moved_reason ?? undefined}
                            className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:shadow-sm", STATUS_STYLE[st] ?? STATUS_STYLE.upcoming, projected && "border-dashed text-ink-500")}
                          >
                            <ChannelIcon channel={s.channel} size={13} />
                            {s.due_date ? fmtDate(s.due_date) : projected ? <>{fmtDate(projected)}<span className="text-[10px] text-ink-400">projected</span></> : `+${s.offset_working_days ?? 0} days`}
                            {s.moved_reason ? <span className="text-[10px] text-ink-400">moved</span> : null}
                          </button>
                        );
                      })}
                      {props.canEdit && props.campaignStatus && !["closed_no_response", "disqualified"].includes(props.campaignStatus) ? (
                        <button onClick={() => setEditing({ step: null, track: t })} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs text-ink-500 hover:border-brand-300 hover:text-brand-700">
                          <Plus size={12} /> Add step
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-ink-400">
                    {blocked ? "Excluded or do not contact" : props.campaignStatus ? "No track in this campaign" : "No campaign yet"}
                  </div>
                )}
              </div>
            </div>
          );
        }

  return (
    <Card>
      <CardHeader title="Contacts and their tracks" hint="One row per person. Each track runs on its own timeline." />
      <div className="mt-3 divide-y divide-line">
        {props.groups ? props.groups.map((g) => {
          const isOpen = openGroups.has(g.key);
          const people = g.contactIds.map((id) => props.contacts.find((c) => c.id === id)).filter((c): c is Contact => !!c);
          if (!people.length) return null;
          return (
            <div key={g.key}>
              <button onClick={() => setOpenGroups((o) => { const n = new Set(o); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} aria-expanded={isOpen}
                className="flex w-full items-baseline gap-2 bg-canvas px-5 py-2 text-left">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">{g.label}</span>
                <span className="text-xs text-ink-400">{people.length}{g.hint ? ` · ${g.hint}` : ""}</span>
                <span className="ml-auto text-xs text-ink-400">{isOpen ? "Hide" : "Show"}</span>
              </button>
              {isOpen ? <div className="divide-y divide-line">{people.map(renderRow)}</div> : null}
            </div>
          );
        }) : ordered.map(renderRow)}
        {!ordered.length ? <div className="px-5 py-8 text-sm text-ink-500">No contacts for this account yet. Add them in the Contacts tab of the sheet.</div> : null}
      </div>

      {startError ? <p role="alert" className="mx-5 mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{startError}</p> : null}
      {editing ? (
        <StepEditor
          step={editing.step}
          track={editing.track}
          contact={props.contacts.find((c) => c.id === editing.track.contact_id)!}
          users={props.users.filter((u) => u.active)}
          isDraft={props.campaignStatus === "draft"}
          projection={projOf.get(editing.track.id) ?? null}
          today={props.today}
          canEdit={props.canEdit}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}
