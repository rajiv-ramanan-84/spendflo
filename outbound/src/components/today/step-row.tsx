"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Phone } from "lucide-react";
import { SendButton, SendStatus, useSendFlow } from "@/components/steps/send-flow";
import type { TodayStep } from "@/lib/data/today";
import type { CockpitStep, CockpitTrack, UserLite } from "@/lib/data/queries";
import { ChannelIcon } from "@/components/ui/channel";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StepEditor } from "@/components/cockpit/step-editor";
import { CHANNEL_LABEL, fmtDate, PERSONA_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json().catch(() => ({ ok: false, error: "No response" }));
}

export async function copyPrepared(stepId: string) {
  const res = await fetch(`/api/steps/${stepId}/prepared`);
  const p = await res.json();
  if (!p.ok) return { ok: false as const, error: p.error as string };
  if (p.unresolved) return { ok: false as const, error: "Fix the placeholder in the copy first" };
  const text = p.subject ? `${p.subject}\n\n${p.body}` : p.body;
  await navigator.clipboard?.writeText(text).catch(() => undefined);
  return { ok: true as const, linkedinUrl: p.linkedinUrl as string | null, email: p.email as string | null, phone: p.phone as string | null, body: p.body as string, subject: p.subject as string | null };
}

export function StepRow({ step, me, users, onActed }: { step: TodayStep; me: string | null; users: UserLite[]; onActed: (id: string, label: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const mineToSend = step.assignee_id === me;
  const sender = users.find((u) => u.id === step.assignee_id);
  const preview = (step.channel === "call" ? step.call_script : step.body) ?? "";

  async function act(path: string, label: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const data = await post(`/api/steps/${step.id}/${path}`, body);
    setBusy(false);
    setMenu(false);
    if (!data.ok) return setError(data.error);
    onActed(step.id, data.date ? `${label} to ${fmtDate(data.date)}` : label);
  }

  const flow = useSendFlow(step.id, (label) => onActed(step.id, label));
  const from = sender?.sendsAs;

  const primary =
    step.channel === "email" || step.channel.startsWith("linkedin") ? (
      <SendButton compact flow={flow} channel={step.channel} disabled={step.channel === "email" && !mineToSend} />
    ) : step.channel === "call" ? (
      <Button className="px-3 py-1.5" onClick={() => setExpanded(true)}><Phone size={14} />Call</Button>
    ) : (
      <Button className="px-3 py-1.5" onClick={() => setExpanded(true)}>Show instructions</Button>
    );

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", step.bucket === "overdue" ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-600")}>
          <ChannelIcon channel={step.channel} size={16} />
        </span>
        <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium">{step.contact.full_name}</span>
            <Link href={`/accounts/${step.account.id}`} className="text-sm text-ink-500 hover:text-brand-700">{step.account.name}</Link>
            <span className="rounded-md bg-canvas px-1.5 text-[11px] font-semibold text-ink-500">{step.account.tier}</span>
            {step.contact.persona ? <span className="text-xs text-ink-400">{PERSONA_LABEL[step.contact.persona]}</span> : null}
          </div>
          <div className="mt-0.5 truncate text-sm text-ink-500">
            <span className="font-medium text-ink-700">{CHANNEL_LABEL[step.channel]}</span>
            {" · "}{fmtDate(step.due_date)}
            {step.subject ? ` · ${step.subject}` : preview ? ` · ${preview.slice(0, 90)}` : ""}
          </div>
          {step.moved_reason ? <div className="text-xs text-ink-400">{step.moved_reason}</div> : null}
          {step.channel !== "call" && from && sender && from.name !== sender.name ? <div className="text-xs text-ink-400">Sends as {from.name} ({from.email})</div> : null}
        </div>
        <div className="ml-12 flex items-center gap-2 sm:ml-0">
          {sender && !mineToSend ? <Avatar name={sender.name} size={22} title={`Sent by ${sender.name}`} /> : null}
          {primary}
          <button onClick={() => setEditing(true)} aria-label="Edit before send" className="rounded-lg p-2 text-ink-400 hover:bg-canvas hover:text-ink-900"><Pencil size={15} /></button>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-label="More" className="rounded-lg p-2 text-ink-400 hover:bg-canvas hover:text-ink-900"><ChevronDown size={15} /></button>
            {menu ? (
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 text-sm shadow-[var(--shadow-lift)]">
                <button className="block w-full px-3 py-2 text-left hover:bg-canvas" onClick={() => act("done", "Marked done")}>Mark done</button>
                {[1, 2, 3].map((d) => <button key={d} className="block w-full px-3 py-2 text-left hover:bg-canvas" onClick={() => act("snooze", "Snoozed", { days: d })}>Snooze {d} working day{d > 1 ? "s" : ""}</button>)}
                <button className="block w-full px-3 py-2 text-left hover:bg-canvas" onClick={() => { const reason = window.prompt("Why skip this step?"); if (reason) act("skip", "Skipped", { reason }); }}>Skip…</button>
                {step.channel !== "email" ? null : <button className="block w-full px-3 py-2 text-left hover:bg-canvas" onClick={async () => { const r = await copyPrepared(step.id); setMenu(false); if (!r.ok) setError(r.error); }}>Copy subject and body</button>}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 rounded-xl border border-line bg-canvas p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-700">{preview || "No script yet. Edit the step to add one."}</pre>
          {step.channel === "call" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {step.contact.phone ? <a href={`tel:${step.contact.phone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-medium shadow-sm"><Phone size={14} />{step.contact.phone}</a> : <span className="text-sm text-ink-500">No phone number on file</span>}
              <span className="ml-2 text-xs text-ink-500">Log outcome:</span>
              {(["connected", "voicemail", "no_answer"] as const).map((o) => (
                <Button key={o} variant="secondary" className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => act("done", `Logged ${o.replace("_", " ")}`, { callOutcome: o })}>
                  {o === "no_answer" ? "No answer" : o[0].toUpperCase() + o.slice(1)}
                </Button>
              ))}
            </div>
          ) : (
            <Button className="mt-3 px-3 py-1.5" onClick={() => act("done", "Marked done")}>Mark done</Button>
          )}
        </div>
      ) : null}
      <SendStatus flow={flow} channel={step.channel} />
      {error || flow.error ? <div role="alert" className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error ?? flow.error}</div> : null}

      {editing ? (
        <StepEditor
          step={step as unknown as CockpitStep}
          track={{ id: step.track_id, assignee_id: step.assignee_id, contact_id: step.contact.id } as unknown as CockpitTrack}
          contact={step.contact}
          users={users}
          isDraft={false}
          canEdit
          onClose={() => { setEditing(false); router.refresh(); }}
          onSent={(label) => onActed(step.id, label)}
        />
      ) : null}
    </li>
  );
}
