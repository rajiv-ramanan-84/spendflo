"use client";

import { cn } from "@/lib/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Send in Gmail and LinkedIn, with as little extra work as possible.
 * Email: open the draft in a Gmail pop-up; the page checks every few seconds
 * and marks the step Done the moment it is sent. LinkedIn: the note is copied,
 * the profile opens in a pop-up, and coming back asks once "Sent it?".
 */

type Phase =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "waiting_email"; link: string; from: string | null; since: number }
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

  async function sendEmail(beforeSend?: () => Promise<boolean>, key?: string) {
    setError(null);
    if (beforeSend && !(await beforeSend())) return;
    setPhase({ kind: "opening" });
    const d = await post(`/api/steps/${stepId}/gmail-draft`);
    if (!d.ok) {
      setPhase({ kind: "idle" });
      return setError(d.error);
    }
    popup(d.link, `gmail-${stepId}`, 760, 820);
    setPushedKey(key ?? null);
    setPhase({ kind: "waiting_email", link: d.link, from: d.from ?? null, since: Date.now() });
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
export function SendStatus({ flow, channel, beforeSend, contentKey }: { flow: ReturnType<typeof useSendFlow>; channel: string; beforeSend?: () => Promise<boolean>; contentKey?: string }) {
  const { phase } = flow;
  if (phase.kind === "waiting_email") {
    const stale = contentKey !== undefined && flow.pushedKey !== null && flow.pushedKey !== contentKey;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5 text-sm">
        <Loader2 size={15} className="animate-spin text-brand-500" />
        <span className="text-ink-700">{stale ? "You changed the email after Gmail opened. Update the draft so Gmail has the latest." : `Gmail is open${phase.from ? ` (${phase.from})` : ""}. Press Send there; this marks itself done.`}</span>
        <span className="ml-auto flex gap-1.5">
          <button onClick={() => void flow.sendEmail(beforeSend, contentKey)} className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium hover:bg-white", stale ? "bg-white text-brand-700 ring-1 ring-brand-200" : "text-brand-700")}><ExternalLink size={13} /> Update and reopen</button>
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
