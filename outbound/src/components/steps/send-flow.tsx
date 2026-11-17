"use client";

import { cn } from "@/lib/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Send in Gmail and LinkedIn, with as little extra work as possible.
 * Email: open the draft in a Gmail pop-up; the page checks every few seconds
 * and marks the step Done the moment it is sent. LinkedIn: the note is copied,
 * the profile opens in a pop-up, and coming back asks once "Sent it?".
 */

/** What the server says about sending this email right now (limits, paused inboxes, the company domain rule). */
export type SendCheck = {
  state: "ok" | "warn" | "full";
  block: { code: "paused" | "cap" | "core"; message: string } | null;
  coreWarning: string | null;
  options: Array<{ key: string; mailboxId: string | null; email: string; left: number; label: string }>;
  canOverride: boolean;
  notice: { email: string; sent: number; max: number; warn: number; state: "ok" | "warn" | "full"; line: string };
  email: string;
  mailboxId: string | null;
};

type SendOpts = { mailboxId?: string | null; override?: boolean; confirmed?: boolean };

type Phase =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "limit"; check: SendCheck; mailboxId: string | null }
  | { kind: "waiting_email"; link: string; from: string | null; since: number; notice: SendCheck["notice"] | null }
  | { kind: "waiting_linkedin"; url: string | null; asked: boolean }
  | { kind: "done" };

const POLL_MS = 8_000;
const POLL_FOR_MS = 15 * 60_000;

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json().catch(() => ({ ok: false, error: "No response" }));
}

function popup(url: string, name: string, w: number, h: number) {
  const left = Math.max(0, Math.round((window.screen.width - w) / 2));
  const top = Math.max(0, Math.round((window.screen.height - h) / 3));
  const win = window.open(url, name, `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  // Pop-up blocked: fall back to a tab so nobody is stuck.
  if (!win) window.open(url, "_blank");
}

export function useSendFlow(stepId: string, onDone: (label: string) => void) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  // What was in the email the last time it was sent to Gmail, to tell when the draft there is out of date.
  const [pushedKey, setPushedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const check = useCallback(async () => {
    const r = await post(`/api/steps/${stepId}/check-sent`);
    if (r.ok && r.sent) {
      stop();
      setPhase({ kind: "done" });
      doneRef.current("Sent. Marked done");
      return true;
    }
    if (!r.ok) setError(r.error);
    return false;
  }, [stepId, stop]);

  // Keep checking while the pop-up is open; check again whenever the page regains focus.
  useEffect(() => {
    if (phase.kind !== "waiting_email") return;
    const since = phase.since;
    timer.current = setInterval(() => {
      if (Date.now() - since > POLL_FOR_MS) return stop();
      void check();
    }, POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      window.removeEventListener("focus", onFocus);
    };
  }, [phase, check, stop]);

  // LinkedIn: ask once when they come back to the app.
  useEffect(() => {
    if (phase.kind !== "waiting_linkedin" || phase.asked) return;
    const onFocus = () => setPhase((p) => (p.kind === "waiting_linkedin" ? { ...p, asked: true } : p));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [phase]);

  async function sendEmail(beforeSend?: () => Promise<boolean>, key?: string, opts: SendOpts = {}) {
    setError(null);
    if (beforeSend && !(await beforeSend())) return;
    setPhase({ kind: "opening" });
    // Ask first, so a warning shows before Gmail opens and takes focus.
    if (!opts.confirmed) {
      const r = await fetch(`/api/steps/${stepId}/send-check${opts.mailboxId ? `?mailbox=${opts.mailboxId}` : ""}`).then((x) => x.json()).catch(() => null);
      const c: SendCheck | null = r?.ok ? r.check : null;
      if (c && (c.block || c.state === "warn" || c.coreWarning)) return setPhase({ kind: "limit", check: c, mailboxId: opts.mailboxId ?? null });
    }
    const d = await post(`/api/steps/${stepId}/gmail-draft`, { mailboxId: opts.mailboxId ?? undefined, override: opts.override || undefined });
    if (!d.ok) {
      // The server is the last word: it can still refuse (a limit reached since the check, say).
      if (d.code === "cap" || d.code === "core" || d.code === "paused") {
        const s = d.sending as { email: string; sent: number; max: number } | undefined;
        return setPhase({
          kind: "limit", mailboxId: opts.mailboxId ?? null,
          check: { state: "full", block: { code: d.code, message: d.error }, coreWarning: null, options: d.options ?? [], canOverride: !!d.canOverride, notice: { email: s?.email ?? "", sent: s?.sent ?? 0, max: s?.max ?? 0, warn: 0, state: "full", line: d.error }, email: s?.email ?? "", mailboxId: opts.mailboxId ?? null },
        });
      }
      setPhase({ kind: "idle" });
      return setError(d.error);
    }
    popup(d.link, `gmail-${stepId}`, 760, 820);
    setPushedKey(key ?? null);
    setPhase({ kind: "waiting_email", link: d.link, from: d.from ?? null, since: Date.now(), notice: d.notice ?? null });
  }

  async function openLinkedIn(beforeOpen?: () => Promise<boolean>) {
    setError(null);
    if (beforeOpen && !(await beforeOpen())) return;
    setPhase({ kind: "opening" });
    const res = await fetch(`/api/steps/${stepId}/prepared`);
    const p = await res.json().catch(() => ({ ok: false, error: "No response" }));
    if (!p.ok || p.unresolved) {
      setPhase({ kind: "idle" });
      return setError(p.error ?? "Fix the placeholder in the copy first");
    }
    await navigator.clipboard?.writeText(p.body).catch(() => undefined);
    if (p.linkedinUrl) popup(p.linkedinUrl, `linkedin-${stepId}`, 1100, 860);
    setPhase({ kind: "waiting_linkedin", url: p.linkedinUrl ?? null, asked: false });
  }

  async function markDone(label = "Marked done") {
    stop();
    const r = await post(`/api/steps/${stepId}/done`);
    if (!r.ok) return setError(r.error);
    setPhase({ kind: "done" });
    doneRef.current(label);
  }

  function reset() {
    stop();
    setPhase({ kind: "idle" });
  }

  return { phase, error, pushedKey, sendEmail, openLinkedIn, markDone, reset, checkNow: check };
}

/** The strip shown while a send is in progress. */
export function SendStatus({ flow, channel, beforeSend, contentKey, onSnooze }: { flow: ReturnType<typeof useSendFlow>; channel: string; beforeSend?: () => Promise<boolean>; contentKey?: string; onSnooze?: () => void }) {
  const { phase } = flow;
  if (phase.kind === "limit") return <LimitCard flow={flow} phase={phase} beforeSend={beforeSend} contentKey={contentKey} onSnooze={onSnooze} />;
  if (phase.kind === "waiting_email") {
    const stale = contentKey !== undefined && flow.pushedKey !== null && flow.pushedKey !== contentKey;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5 text-sm">
        <Loader2 size={15} className="animate-spin text-brand-500" />
        <span className="text-ink-700">{stale ? "You changed the email after Gmail opened. Update the draft so Gmail has the latest." : `Gmail is open${phase.from ? ` (${phase.from})` : ""}. Press Send there; this marks itself done.`}
          {phase.notice && !stale ? <span className={cn("ml-1.5 text-xs", phase.notice.state === "warn" ? "font-medium text-amber-800" : "text-ink-400")}>{phase.notice.state === "warn" ? phase.notice.line : `Email ${phase.notice.sent + 1} of ${phase.notice.max} today.`}</span> : null}
        </span>
        <span className="ml-auto flex gap-1.5">
          <button onClick={() => void flow.sendEmail(beforeSend, contentKey, { confirmed: true })} className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium hover:bg-white", stale ? "bg-white text-brand-700 ring-1 ring-brand-200" : "text-brand-700")}><ExternalLink size={13} /> Update and reopen</button>
          <button onClick={() => flow.markDone("Marked sent")} className="rounded-lg px-2 py-1 text-xs font-medium text-ink-600 hover:bg-white">I sent it</button>
          <button onClick={flow.reset} className="rounded-lg px-2 py-1 text-xs text-ink-400 hover:bg-white">Stop</button>
        </span>
      </div>
    );
  }
  if (phase.kind === "waiting_linkedin") {
    const verb = channel === "linkedin_connect" ? "Connect, then Add a note" : "Message";
    return (
      <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${phase.asked ? "border-emerald-300 bg-emerald-50" : "border-brand-200 bg-brand-50/60"}`}>
        <span className="text-ink-700">
          {phase.asked ? <b>Sent it?</b> : <>Note copied. In LinkedIn: <b>{verb}</b>, paste (Cmd+V), Send.</>}
          {!phase.url ? " No LinkedIn URL on file for this person." : null}
        </span>
        <span className="ml-auto flex gap-1.5">
          <Button className="px-3 py-1 text-xs" onClick={() => flow.markDone("Sent on LinkedIn")}><Check size={13} /> {phase.asked ? "Yes, mark done" : "Mark done"}</Button>
          <button onClick={flow.reset} className="rounded-lg px-2 py-1 text-xs text-ink-500 hover:bg-white">Not yet</button>
        </span>
      </div>
    );
  }
  return null;
}

/**
 * Shown instead of opening Gmail when a send needs a decision. Warning: go ahead, use another inbox, or wait.
 * Blocked: the limit or a rule says no, so the choices are another inbox or tomorrow (an admin or manager can let it through).
 */
function LimitCard({ flow, phase, beforeSend, contentKey, onSnooze }: { flow: ReturnType<typeof useSendFlow>; phase: Extract<Phase, { kind: "limit" }>; beforeSend?: () => Promise<boolean>; contentKey?: string; onSnooze?: () => void }) {
  const { check } = phase;
  const blocked = !!check.block;
  const message = check.block?.message ?? check.coreWarning ?? check.notice.line;
  return (
    <div role="alert" className={cn("mt-3 rounded-xl border px-3.5 py-3 text-sm", blocked ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50")}>
      <div className="flex items-start gap-2">
        <ShieldAlert size={16} className={cn("mt-0.5 shrink-0", blocked ? "text-rose-600" : "text-amber-700")} />
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium", blocked ? "text-rose-900" : "text-amber-900")}>{blocked ? (check.block!.code === "core" ? "Use an outreach inbox for this one" : check.block!.code === "paused" ? "This inbox is paused" : "Daily limit reached") : "Heads up before you send"}</p>
          <p className="mt-0.5 text-ink-700">{message}</p>
          {check.options.length ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ink-500">Send from</span>
              {check.options.slice(0, 4).map((o) => (
                <button key={o.key} onClick={() => void flow.sendEmail(beforeSend, contentKey, { mailboxId: o.mailboxId })} className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-medium hover:border-brand-300">{o.email} <span className="font-normal text-ink-400">· {o.left} left</span></button>
              ))}
            </div>
          ) : blocked ? <p className="mt-1.5 text-xs text-ink-500">No other inbox has room. Connect one in Settings, My setup.</p> : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {!blocked ? <Button className="px-3 py-1 text-xs" onClick={() => void flow.sendEmail(beforeSend, contentKey, { mailboxId: phase.mailboxId, confirmed: true })}>Send anyway</Button> : null}
            {blocked && check.canOverride && check.block!.code !== "paused" ? <button onClick={() => void flow.sendEmail(beforeSend, contentKey, { mailboxId: phase.mailboxId, override: true, confirmed: true })} className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100">Send anyway (override)</button> : null}
            {onSnooze ? <button onClick={() => { flow.reset(); onSnooze(); }} className="rounded-lg px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-white">Move to tomorrow</button> : null}
            <button onClick={flow.reset} className="rounded-lg px-2.5 py-1 text-xs text-ink-500 hover:bg-white">Not now</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The one primary button for a step, by channel. */
export function SendButton({ flow, channel, disabled, beforeSend, compact, contentKey }: { flow: ReturnType<typeof useSendFlow>; channel: string; disabled?: boolean; beforeSend?: () => Promise<boolean>; compact?: boolean; contentKey?: string }) {
  const busy = flow.phase.kind === "opening";
  const cls = compact ? "px-3 py-1.5" : "";
  if (channel === "email") {
    const waiting = flow.phase.kind === "waiting_email";
    return <Button className={cls} disabled={disabled || busy} onClick={() => flow.sendEmail(beforeSend, contentKey)}><Send size={14} /> {busy ? "Opening Gmail..." : waiting ? "Update draft in Gmail" : "Send in Gmail"}</Button>;
  }
  if (channel.startsWith("linkedin")) {
    const label = channel === "linkedin_connect" ? "Connect on LinkedIn" : channel === "linkedin_inmail" ? "InMail on LinkedIn" : "Message on LinkedIn";
    return <Button className={cls} disabled={disabled || busy} onClick={() => flow.openLinkedIn(beforeSend)}>{busy ? "Opening..." : label}</Button>;
  }
  return null;
}
