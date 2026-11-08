"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, Copy, Lock, Phone, X } from "lucide-react";
import type { TodayStep } from "@/lib/data/today";
import type { UserLite } from "@/lib/data/queries";
import { SendButton, SendStatus, useSendFlow } from "@/components/steps/send-flow";
import { ChannelIcon } from "@/components/ui/channel";
import { Button } from "@/components/ui/button";
import { CHANNEL_LABEL, fmtDate, PERSONA_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";
import { needsEdit } from "@/lib/tasks/state";

type Ctx = {
  contact: { full_name: string; title: string | null; email: string | null; linkedin_url: string | null; phone: string | null; bounced: boolean | null; engagement_status: string | null; persona: string | null; replies: number };
  track: Array<{ id: string; sequence_no: number; channel: string; status: string; due_date: string | null; completed_at: string | null; current: boolean }>;
  previous: { sequence_no: number; channel: string; subject: string | null; text: string; sent_on: string | null } | null;
  account: { id: string; name: string; tier: string | null; job: string | null; objective: string | null };
  week: Array<{ id: string; date: string; name: string; channel: string; done: boolean; current: boolean }>;
};

type Tab = "content" | "contact" | "account";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json().catch(() => ({ ok: false, error: "No response" }));
}

export function TaskPanel(props: {
  task: TodayStep;
  me: string | null;
  senderName: string;
  senderEmail: string | null;
  today: string;
  batch: { index: number; total: number; done: number } | null;
  onDone: (id: string, label: string) => void;
  onSnoozed: (id: string, date: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onEndBatch: () => void;
  users: UserLite[];
}) {
  const t = props.task;
  const [tab, setTab] = useState<Tab>("content");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [subject, setSubject] = useState(t.subject ?? "");
  const [text, setText] = useState((t.channel === "call" ? t.call_script : t.body) ?? "");
  const [save, setSave] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiting = t.state === "waiting";
  const isEmail = t.channel === "email";
  const isLinkedIn = t.channel.startsWith("linkedin");
  const notMine = isEmail && t.assignee_id !== props.me;

  useEffect(() => {
    let live = true;
    fetch(`/api/steps/${t.id}/context`).then((r) => r.json()).then((d) => { if (live && d.ok) setCtx(d as Ctx); }).catch(() => undefined);
    return () => { live = false; };
  }, [t.id]);

  const persist = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSave("saving");
    const res = await fetch(`/api/steps/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(t.channel === "call" ? { call_script: text } : isEmail ? { subject, body: text } : { body: text }),
    });
    const d = await res.json().catch(() => ({ ok: false, error: "No response" }));
    if (!d.ok) { setSave("error"); setError(d.error); return false; }
    setSave("saved");
    return true;
  }, [t.id, t.channel, isEmail, subject, text]);

  // Autosave a moment after typing stops.
  useEffect(() => {
    if (save !== "dirty") return;
    timer.current = setTimeout(() => void persist(), 900);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [save, persist, subject, text]);

  const beforeSend = useCallback(async () => (save === "dirty" || save === "error" ? persist() : true), [save, persist]);
  const flow = useSendFlow(t.id, (label) => props.onDone(t.id, label));

  async function act(path: string, label: string, body?: unknown) {
    setBusy(true);
    setError(null);
    if (!(await beforeSend())) return setBusy(false);
    const d = await post(`/api/steps/${t.id}/${path}`, body);
    setBusy(false);
    if (!d.ok) return setError(d.error);
    if (path === "snooze") return props.onSnoozed(t.id, d.date);
    props.onDone(t.id, label);
  }

  // Re-checked as you type, with the same rule the list uses.
  const editReason = waiting ? null : needsEdit({ channel: t.channel, subject, body: text, call_script: text }, t.contact, t.account.name);
  const from = isEmail ? `${props.senderName}${props.senderEmail ? ` <${props.senderEmail}>` : ""}` : t.channel === "call" ? `${props.senderName}, from your phone` : `Your LinkedIn, written as ${props.senderName}`;

  return (
    <aside className="fixed inset-0 z-40 flex flex-col bg-white lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:max-h-[calc(100vh-2rem)] lg:rounded-2xl lg:border lg:border-line lg:shadow-[var(--shadow-lift)]" aria-label={`Task for ${t.contact.full_name}`}>
      <div className="flex items-center gap-1 border-b border-line px-2 pt-1">
        {(["content", "contact", "account"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cn("border-b-2 px-3 py-2.5 text-sm font-medium capitalize", tab === k ? "border-brand-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900")}>{k}</button>
        ))}
        <div className="ml-auto flex">
          <button onClick={props.onPrev} aria-label="Previous task (K)" className="rounded-lg p-2 text-ink-400 hover:bg-canvas hover:text-ink-900"><ArrowUp size={16} /></button>
          <button onClick={props.onNext} aria-label="Next task (J)" className="rounded-lg p-2 text-ink-400 hover:bg-canvas hover:text-ink-900"><ArrowDown size={16} /></button>
          <button onClick={props.onClose} aria-label="Close (Esc)" className="rounded-lg p-2 text-ink-400 hover:bg-canvas hover:text-ink-900"><X size={16} /></button>
        </div>
      </div>

      {props.batch ? (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">
          <span className="whitespace-nowrap">Batch · {props.batch.index} of {props.batch.total}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-200"><span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(props.batch.done / props.batch.total) * 100}%` }} /></span>
          <button onClick={props.onEndBatch} className="rounded-lg px-2 py-0.5 text-xs font-medium hover:bg-white">End</button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {tab === "content" ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm">
              <span className="text-ink-400">From</span><span className="break-words text-ink-700">{from}</span>
              <span className="text-ink-400">To</span>
              <span className="flex flex-wrap items-center gap-x-2 text-ink-700">
                <b className="text-ink-900">{t.contact.full_name}</b>{t.contact.title ? <span className="text-ink-500">· {t.contact.title}</span> : null}
              </span>
              <span className="text-ink-400">Step</span>
              <span className="flex flex-wrap items-center gap-x-2 text-ink-700">
                <ChannelIcon channel={t.channel} size={13} className="text-brand-500" />{CHANNEL_LABEL[t.channel]} · step {t.sequence_no}{ctx ? ` of ${ctx.track.length}` : ""} · {t.due_date ? fmtDate(t.due_date) : "no date yet"}
                <span className={cn("text-xs", save === "error" ? "text-brand-700" : save === "saved" ? "text-emerald-600" : "text-ink-400")}>{save === "saved" ? "✓ Saved" : save === "saving" ? "Saving..." : save === "error" ? "Not saved" : "Editing"}</span>
              </span>
            </div>
            {isEmail ? (
              <input id={`subj-${t.id}`} value={subject} onChange={(e) => { setSubject(e.target.value); setSave("dirty"); }} placeholder="Subject" aria-label="Subject" className="w-full rounded-xl border border-line px-3 py-2 text-sm font-semibold focus:border-brand-300 focus:outline-none" />
            ) : null}
            {t.channel === "call" && t.contact.phone ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-50/60 px-3 py-2 text-sm">
                <a href={`tel:${t.contact.phone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-1.5 font-semibold text-ink-900"><Phone size={14} />{t.contact.phone}</a>
                <button onClick={() => navigator.clipboard?.writeText(t.contact.phone ?? "").catch(() => undefined)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-white"><Copy size={12} />Copy</button>
              </div>
            ) : null}
            <textarea id={`body-${t.id}`} value={text} onChange={(e) => { setText(e.target.value); setSave("dirty"); }} aria-label={t.channel === "call" ? "Call script" : "Message"} rows={isEmail ? 11 : 7} className="w-full resize-y rounded-xl border border-line bg-canvas p-3 text-sm leading-relaxed text-ink-900 focus:border-brand-300 focus:bg-white focus:outline-none" />
            {t.channel === "linkedin_connect" && text.length > 300 ? <div className="text-xs text-amber-700">{text.length} characters. LinkedIn notes stop at 300.</div> : null}
            {waiting ? <Notice tone="lock"><Lock size={13} className="mt-0.5 shrink-0" />{t.state_reason}. It goes out once that happens, so it can&apos;t be done early.</Notice> : null}
            {editReason ? <Notice tone="warn">{editReason}.</Notice> : null}
            {notMine && !waiting ? <Notice tone="warn">This email goes from {props.senderName}&apos;s mailbox, so they send it.</Notice> : null}
            {ctx?.previous ? (
              <details className="rounded-xl border border-dashed border-line text-sm">
                <summary className="cursor-pointer px-3 py-2 text-ink-500">Step {ctx.previous.sequence_no}{ctx.previous.sent_on ? `, sent ${fmtDate(ctx.previous.sent_on)}` : ""}{ctx.previous.subject ? `: ${ctx.previous.subject}` : ""}</summary>
                <p className="whitespace-pre-wrap px-3 pb-3 leading-relaxed text-ink-700">{ctx.previous.text}</p>
              </details>
            ) : null}
            <SendStatus flow={flow} channel={t.channel} />
            {error || flow.error ? <div role="alert" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error ?? flow.error}</div> : null}
          </div>
        ) : tab === "contact" ? (
          <ContactTab t={t} ctx={ctx} />
        ) : (
          <AccountTab t={t} ctx={ctx} today={props.today} />
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        {skipping ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void act("skip", "Skipped", { reason }); }}>
            <input id={`skip-${t.id}`} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why skip it? (for the log)" className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm focus:border-brand-300 focus:outline-none" />
            <Button type="submit" variant="secondary" className="px-3 py-2" disabled={!reason.trim() || busy}>Skip it</Button>
            <button type="button" onClick={() => setSkipping(false)} className="px-2 text-sm text-ink-500">Cancel</button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {waiting ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-ink-500"><Lock size={14} />Waiting. Edit the copy now; send when it starts.</span>
            ) : t.channel === "call" ? (
              <>
                <span className="text-xs text-ink-500">Outcome:</span>
                <Button className="px-3 py-2" disabled={busy} onClick={() => act("done", "Logged connected", { callOutcome: "connected" })}>Connected</Button>
                <Button variant="secondary" className="px-3 py-2" disabled={busy} onClick={() => act("done", "Logged voicemail", { callOutcome: "voicemail" })}>Voicemail</Button>
                <Button variant="secondary" className="px-3 py-2" disabled={busy} onClick={() => act("done", "Logged no answer", { callOutcome: "no_answer" })}>No answer</Button>
              </>
            ) : isEmail || isLinkedIn ? (
              <SendButton compact flow={flow} channel={t.channel} disabled={notMine || !!editReason || busy} beforeSend={beforeSend} />
            ) : (
              <Button className="px-3 py-2" disabled={busy} onClick={() => act("done", "Marked done")}>Mark done</Button>
            )}
            {!waiting ? (
              <>
                <button onClick={() => setSkipping(true)} className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:border-brand-200">Skip</button>
                <div className="relative">
                  <button onClick={() => setSnoozeOpen((o) => !o)} className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:border-brand-200">Snooze</button>
                  {snoozeOpen ? (
                    <div className="absolute bottom-full left-0 z-10 mb-1 w-44 overflow-hidden rounded-xl border border-line bg-white py-1 text-sm shadow-[var(--shadow-lift)]">
                      {[1, 2, 3].map((d) => <button key={d} className="block w-full px-3 py-2 text-left hover:bg-canvas" onClick={() => { setSnoozeOpen(false); void act("snooze", "Snoozed", { days: d }); }}>{d} working day{d > 1 ? "s" : ""}</button>)}
                    </div>
                  ) : null}
                </div>
                {t.channel !== "call" ? (
                  <button onClick={() => (flow.phase.kind === "idle" || flow.phase.kind === "done" ? act("done", "Marked done") : flow.markDone("Marked done"))} disabled={busy} className="ml-auto inline-flex items-center gap-1 rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:border-brand-200">
                    <Check size={14} />Done &amp; next<ArrowRight size={14} />
                  </button>
                ) : null}
              </>
            ) : (
              <button onClick={props.onNext} className="ml-auto inline-flex items-center gap-1 rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:border-brand-200">Next<ArrowRight size={14} /></button>
            )}
          </div>
        )}
        <div className="mt-2 hidden text-[11px] text-ink-400 lg:block"><Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>X</Kbd> tick · <Kbd>Esc</Kbd> close</div>
      </div>
    </aside>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-white px-1 font-sans">{children}</kbd>;
}

function Notice({ tone, children }: { tone: "warn" | "lock"; children: React.ReactNode }) {
  return <div className={cn("flex gap-2 rounded-xl px-3 py-2 text-sm", tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-canvas text-ink-600")}>{children}</div>;
}

function ContactTab({ t, ctx }: { t: TodayStep; ctx: Ctx | null }) {
  const c = ctx?.contact;
  const rows: Array<[string, React.ReactNode]> = [
    ["Role", PERSONA_LABEL[t.contact.persona ?? ""] ?? t.contact.persona ?? "Not set"],
    ["Title", t.contact.title ?? "Not on file"],
    ["Email", c?.email ? <span className={c.bounced ? "text-brand-700 line-through" : ""}>{c.email}</span> : "Not on file"],
    ["LinkedIn", c?.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Open profile</a> : "Not on file"],
    ["Phone", c?.phone ?? "Not on file"],
    ["Engagement", (c?.engagement_status ?? "").replace(/_/g, " ") || "Not contacted"],
    ["Replies", c ? String(c.replies) : "..."],
  ];
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2">
        {rows.map(([k, v]) => <FragmentRow key={k} k={k} v={v} />)}
      </div>
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Their track</h3>
        <ol className="mt-2 flex flex-col gap-1.5">
          {(ctx?.track ?? []).map((s) => (
            <li key={s.id} className={cn("flex items-center gap-2", s.current && "font-semibold text-ink-900")}>
              <span className={cn("h-2 w-2 shrink-0 rounded-full", s.status === "done" ? "bg-emerald-500" : s.current ? "bg-brand-500" : s.status === "skipped" ? "bg-ink-300" : "bg-line")} />
              <ChannelIcon channel={s.channel} size={12} className="text-ink-400" />
              Step {s.sequence_no} · {CHANNEL_LABEL[s.channel]} · {s.status === "done" ? `sent ${fmtDate(s.completed_at)}` : s.status === "skipped" ? "skipped" : s.due_date ? fmtDate(s.due_date) : "waits"}
            </li>
          ))}
          {!ctx ? <li className="text-ink-400">Loading...</li> : null}
        </ol>
      </div>
    </div>
  );
}

function AccountTab({ t, ctx, today }: { t: TodayStep; ctx: Ctx | null; today: string }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center gap-2"><b className="text-base">{t.account.name}</b>{t.account.tier ? <span className="rounded-md bg-canvas px-1.5 text-[11px] font-semibold text-ink-500">{t.account.tier}</span> : null}</div>
      {ctx?.account.job || ctx?.account.objective ? (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2">
          {ctx.account.job ? <FragmentRow k="The job" v={ctx.account.job} /> : null}
          {ctx.account.objective ? <FragmentRow k="Goal" v={ctx.account.objective} /> : null}
        </div>
      ) : null}
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">This week at {t.account.name}</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {(ctx?.week ?? []).map((w) => (
            <li key={w.id} className={cn("flex gap-3", w.current && "font-semibold text-brand-700")}>
              <span className="w-20 shrink-0 tabular-nums text-ink-400">{w.date === today ? "Today" : fmtDate(w.date)}</span>
              <span className="min-w-0">{w.name} · {CHANNEL_LABEL[w.channel]}{w.done ? " · sent" : ""}</span>
            </li>
          ))}
          {ctx && !ctx.week.length ? <li className="text-ink-400">Nothing else this week.</li> : null}
          {!ctx ? <li className="text-ink-400">Loading...</li> : null}
        </ul>
        {ctx ? <p className="mt-2 text-xs text-ink-400">{ctx.week.length} of 6 account touches used this week.</p> : null}
      </div>
      <Link href={`/accounts/${t.account.id}`} className="inline-flex w-fit items-center gap-1 rounded-xl border border-line px-3 py-1.5 font-medium hover:border-brand-200">Open account page<ArrowRight size={14} /></Link>
    </div>
  );
}

function FragmentRow({ k, v }: { k: string; v: React.ReactNode }) {
  return <><span className="text-ink-400">{k}</span><span className="min-w-0 break-words text-ink-900">{v}</span></>;
}
