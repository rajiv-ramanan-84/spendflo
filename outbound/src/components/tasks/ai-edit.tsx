"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

type Proposal = { subject: string | null; body: string; changed: string; warnings: string[] };
const CHIPS = ["Shorter", "Warmer", "More direct", "Softer ask", "Lead with the trigger"];

/**
 * Edit with AI for one message. Asks, shows the new version, and only changes
 * the message when the owner keeps it. Nothing is saved until then.
 */
export function AiEdit(p: { stepId: string; isEmail: boolean; subject: string; body: string; disabled?: boolean; onKeep: (v: { subject: string | null; body: string }) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prop, setProp] = useState<Proposal | null>(null);

  async function ask(instruction: string) {
    if (!instruction.trim() || busy) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/steps/${p.stepId}/ai-edit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction }) });
    const d = await res.json().catch(() => ({ ok: false, error: "No response" }));
    setBusy(false);
    if (!d.ok) return setError(d.error);
    setProp(d as Proposal);
  }

  if (prop) {
    return (
      <div className="flex flex-col gap-2.5 rounded-xl border border-brand-200 bg-brand-50/40 p-3" aria-live="polite">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700"><Sparkles size={13} />Proposed edit</div>
        <p className="text-sm text-ink-700">{prop.changed}</p>
        {p.isEmail && prop.subject ? <div className="rounded-lg bg-white px-3 py-2 text-sm font-semibold">{prop.subject}</div> : null}
        <div className="whitespace-pre-wrap rounded-lg bg-white px-3 py-2.5 text-sm leading-relaxed text-ink-900">{prop.body}</div>
        {prop.warnings.length ? <ul className="text-xs text-amber-700">{prop.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { p.onKeep({ subject: prop.subject, body: prop.body }); setProp(null); setText(""); }} className="rounded-lg bg-ink-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-ink-700">Keep</button>
          <button onClick={() => setProp(null)} className="rounded-lg border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-ink-700 hover:bg-canvas">Discard</button>
          <span className="text-xs text-ink-400">Your current version stays until you keep this one.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={(e) => { e.preventDefault(); void ask(text); }} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 focus-within:border-brand-300">
        <Sparkles size={14} className="shrink-0 text-brand-500" />
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy || p.disabled} placeholder="Ask AI to edit, for example: open with the acquisition" aria-label="Edit with AI" className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-ink-400" />
        <button type="submit" disabled={busy || !text.trim() || p.disabled} className="rounded-lg px-2.5 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:text-ink-300">{busy ? "Editing…" : "Edit"}</button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => <button key={c} type="button" disabled={busy || p.disabled} onClick={() => void ask(c)} className={cn("rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-700 hover:bg-canvas", busy && "opacity-50")}>{c}</button>)}
      </div>
      {error ? <div role="alert" className="text-xs text-brand-700">{error}</div> : null}
    </div>
  );
}
