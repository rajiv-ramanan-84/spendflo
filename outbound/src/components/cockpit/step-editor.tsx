"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SendButton, SendStatus, useSendFlow } from "@/components/steps/send-flow";
import { Trash2, X } from "lucide-react";
import type { CockpitStep, CockpitTrack, UserLite } from "@/lib/data/queries";
import { copyIssues, wordCount } from "@/lib/claude/copy-checks";
import { CHANNELS, type Channel } from "@/lib/claude/schemas";
import { CHANNEL_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function StepEditor(props: {
  step: CockpitStep | null;
  track: CockpitTrack;
  contact: { full_name: string; email: string | null; linkedin_url: string | null };
  users: UserLite[];
  isDraft: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSent?: (label: string) => void;
}) {
  const router = useRouter();
  const s = props.step;
  const closed = !!s && ["done", "skipped", "superseded"].includes(s.status);
  const [channel, setChannel] = useState<Channel>((s?.channel as Channel) ?? "email");
  const [subject, setSubject] = useState(s?.subject ?? "");
  const [body, setBody] = useState(s?.body ?? "");
  const [script, setScript] = useState(s?.call_script ?? "");
  const [date, setDate] = useState(s?.due_date ?? "");
  // The account owner sends every step; the From is their mailbox (maybe a shared one, written as someone else).
  const sender = props.users.find((u) => u.id === (s?.assignee_id ?? props.track.assignee_id));
  const from = sender?.sendsAs ?? (sender ? { name: sender.name, email: sender.email } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issues = useMemo(() => copyIssues(channel, channel === "email" ? subject : null, channel === "call" ? script || null : body, { emailWords: 150, connectChars: 300 }), [channel, subject, body, script]);
  const editable = props.canEdit && !closed;

  async function persist(): Promise<boolean> {
    setBusy(true);
    setError(null);
    const payload = { channel, subject: channel === "email" ? subject : null, body: channel === "call" ? null : body, call_script: channel === "call" ? script : null, date: date || undefined };
    const res = s
      ? await fetch(`/api/steps/${s.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch(`/api/tracks/${props.track.id}/steps`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setError(data.error);
      return false;
    }
    return true;
  }

  async function save() {
    if (await persist()) {
      router.refresh();
      props.onClose();
    }
  }

  // Send from here too: saves your edits first, then opens Gmail or LinkedIn.
  const flow = useSendFlow(s?.id ?? "new", (label) => {
    router.refresh();
    props.onSent?.(label);
    props.onClose();
  });
  const canSendNow = !!s && !props.isDraft && !!s.due_date && ["upcoming", "due", "overdue"].includes(s.status) && (channel === "email" || channel.startsWith("linkedin"));

  async function remove() {
    if (!s) return;
    setBusy(true);
    const res = await fetch(`/api/steps/${s.id}`, { method: "DELETE" });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) return setError(data.error);
    router.refresh();
    props.onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/30 p-0 md:items-center md:p-6" onClick={props.onClose}>
      <div role="dialog" aria-label="Edit step" onClick={(e) => e.stopPropagation()} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-[var(--shadow-lift)] md:rounded-2xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">{s ? `Step ${s.sequence_no}` : "New step"} · {props.contact.full_name}</div>
            {s?.moved_reason ? <div className="mt-1 text-xs text-ink-500">{s.moved_reason}</div> : null}
          </div>
          <button onClick={props.onClose} aria-label="Close" className="rounded-lg p-1 text-ink-400 hover:bg-canvas hover:text-ink-900"><X size={18} /></button>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-ink-500">Channel
              <select disabled={!editable} value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="mt-1 w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink-900">
                {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-ink-500">Date
              <input disabled={!editable || (!!s && !s.due_date && !props.isDraft)} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink-900" />
            </label>
            <div className="text-xs font-medium text-ink-500">From
              <div className="mt-1 rounded-lg border border-line bg-canvas px-2.5 py-2 text-sm text-ink-900" title={from?.email}>
                {channel === "call" ? (sender?.name ?? "Owner") : (from?.name ?? "Owner")}
                {channel !== "call" && from && sender && from.name !== sender.name ? <span className="text-ink-400"> · sent by {sender.name}</span> : null}
              </div>
            </div>
          </div>

          {channel === "email" ? (
            <label className="text-xs font-medium text-ink-500">Subject
              <input disabled={!editable} value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-900" />
            </label>
          ) : null}

          {channel === "call" ? (
            <label className="text-xs font-medium text-ink-500">Call script
              <textarea disabled={!editable} value={script} onChange={(e) => setScript(e.target.value)} rows={10} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm leading-relaxed text-ink-900" />
            </label>
          ) : (
            <label className="text-xs font-medium text-ink-500">
              <span className="flex justify-between">
                <span>{channel === "linkedin_connect" ? "Connect note" : "Message"}</span>
                <span className={cn("tabular-nums", (channel === "linkedin_connect" && body.length > 300) || (channel === "email" && wordCount(body) > 150) ? "text-danger" : "text-ink-400")}>
                  {channel === "linkedin_connect" ? `${body.length} / 300 characters` : channel === "email" ? `${wordCount(body)} words` : ""}
                </span>
              </span>
              <textarea disabled={!editable} value={body} onChange={(e) => setBody(e.target.value)} rows={channel === "email" ? 9 : 5} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm leading-relaxed text-ink-900" />
            </label>
          )}

          {issues.length ? (
            <ul className="grid gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {issues.map((i) => <li key={i}>This step {i}.</li>)}
            </ul>
          ) : null}
          {s?.original_body && s.original_body !== s.body ? (
            <details className="text-xs text-ink-500">
              <summary className="cursor-pointer">Claude&apos;s original draft</summary>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-canvas p-3 text-ink-700">{s.original_body}</p>
            </details>
          ) : null}
          {error || flow.error ? <div role="alert" className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700">{error ?? flow.error}</div> : null}
          <SendStatus flow={flow} channel={channel} />
        </div>

        {editable ? (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            {s ? (
              <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-danger">
                <Trash2 size={14} /> {props.isDraft ? "Delete step" : "Skip step"}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
              <Button variant={canSendNow ? "secondary" : "primary"} onClick={save} disabled={busy || (!s && !date)}>{busy ? "Saving…" : "Save"}</Button>
              {canSendNow ? <SendButton flow={flow} channel={channel} disabled={busy} beforeSend={persist} /> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
