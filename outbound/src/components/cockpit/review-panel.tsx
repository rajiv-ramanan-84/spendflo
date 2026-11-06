"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canLaunch, openFlags, type ReviewFlag } from "@/lib/campaigns/launch";
import { openContactFinder } from "./contact-finder";

/** Flags about people missing from the contact list get a one-click web search. */
const MISSING_CONTACT = /\b(add (that|this|the|a|one)?\s*(person|contact)|add contact|not (in|among) the contacts|no (coupa admin|economic buyer|system owner|contract manager|cpo|procurement lead)|is not in the contacts|missing contact)/i;

type Props = {
  campaignId: string;
  accountId: string;
  name: string;
  objective: string;
  rationale: string;
  likelyReply: string | null;
  mainWeakness: string | null;
  flags: ReviewFlag[];
  cleared: string[];
  notes: Array<{ text: string }>;
  skipped: Array<{ contactRef: string; reason: string }>;
  datedSteps: number;
  canEdit: boolean;
};

export function ReviewPanel(p: Props) {
  const router = useRouter();
  const [cleared, setCleared] = useState<string[]>(p.cleared);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const open = openFlags(p.flags, cleared);
  const gate = canLaunch(p.flags, cleared, p.datedSteps);

  async function clear(flagId: string, how: "resolved" | "dismissed") {
    setBusy(flagId);
    const res = await fetch(`/api/campaigns/${p.campaignId}/flags`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flagId, how }) });
    const data = await res.json();
    setBusy(null);
    if (!data.ok) return setError(data.error);
    setCleared((c) => [...c, flagId]);
  }

  async function clearAll() {
    setBusy("all");
    const res = await fetch(`/api/campaigns/${p.campaignId}/flags`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
    const data = await res.json();
    setBusy(null);
    if (!data.ok) return setError(data.error);
    setCleared(p.flags.map((f) => f.id));
  }

  const [confirming, setConfirming] = useState(false);

  async function launch(acknowledgeFlags = false) {
    // Open flags never block: show them once and let the owner decide.
    if (open.length && !acknowledgeFlags) return setConfirming(true);
    setConfirming(false);
    setBusy("launch");
    setError(null);
    const res = await fetch(`/api/campaigns/${p.campaignId}/launch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acknowledgeFlags }) });
    const data = await res.json();
    setBusy(null);
    if (!data.ok) return setError(data.error);
    router.refresh();
  }

  async function regenerate() {
    setBusy("regen");
    const res = await fetch(`/api/accounts/${p.accountId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const data = await res.json();
    setBusy(null);
    if (!data.ok) return setError(data.error);
    router.refresh();
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">Draft for review</div>
          <h2 className="mt-1 text-lg font-semibold">{p.name}</h2>
          <p className="mt-1 text-sm text-ink-700">{p.objective}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">{p.rationale}</p>
          {p.mainWeakness ? (
            <p className="mt-2 text-sm text-ink-500">
              <span className="font-medium text-ink-700">Likely reply: {p.likelyReply}.</span> Main weakness: {p.mainWeakness}
            </p>
          ) : null}
        </div>
        {p.canEdit ? (
          <div className="flex flex-col items-end gap-2">
            <Button onClick={() => launch()} disabled={!gate.ok || busy !== null}>
              <Rocket size={16} />{busy === "launch" ? "Launching…" : "Launch"}
            </Button>
            <span className="text-xs text-ink-400">{!gate.ok ? gate.reason : open.length ? `${open.length} flag${open.length > 1 ? "s" : ""} not reviewed (you can still launch)` : "Every step keeps its working-day date"}</span>
            <button onClick={regenerate} disabled={busy !== null} className="text-xs text-ink-500 underline hover:text-ink-900">
              {busy === "regen" ? "Sending to Claude..." : "Regenerate draft"}
            </button>
          </div>
        ) : null}
      </div>

      {confirming ? (
        <div role="alertdialog" aria-label="Launch with open flags" className="mx-5 mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 md:mx-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={16} /> {open.length} flag{open.length > 1 ? "s" : ""} not reviewed</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {open.slice(0, 5).map((f) => <li key={f.id}>{f.text}</li>)}
            {open.length > 5 ? <li>and {open.length - 5} more</li> : null}
          </ul>
          <p className="mt-2 text-xs text-amber-800">Launching schedules the steps. Nothing is sent: you still review and send every touch.</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>Review first</Button>
            <Button onClick={() => launch(true)} disabled={busy !== null}><Rocket size={16} /> {busy === "launch" ? "Launching..." : "Launch anyway"}</Button>
          </div>
        </div>
      ) : null}

      {error ? <div role="alert" className="mx-5 mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 md:mx-6">{error}</div> : null}

      {p.flags.length ? (
        <div className="border-t border-line px-5 py-4 md:px-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {open.length ? <AlertTriangle size={16} className="text-warning" /> : <CheckCircle2 size={16} className="text-success" />}
              {open.length ? `${open.length} of ${p.flags.length} flags to review before launch` : "All flags reviewed"}
            </div>
            {open.length > 1 && p.canEdit ? (
              <button onClick={clearAll} disabled={busy !== null} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-900 shadow-sm hover:bg-canvas">
                {busy === "all" ? "Saving..." : `I've read all ${open.length}`}
              </button>
            ) : null}
          </div>
          <ul className="grid gap-2">
            {p.flags.map((f) => {
              const done = cleared.includes(f.id);
              return (
                <li key={f.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${done ? "border-line bg-canvas text-ink-400 line-through" : "border-amber-200 bg-amber-50 text-ink-900"}`}>
                  <span>{f.text}</span>
                  {!done && p.canEdit ? (
                    <span className="flex gap-2">
                      {MISSING_CONTACT.test(f.text) ? <button onClick={() => openContactFinder(f.text)} className="rounded-lg bg-brand-500 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-brand-600">Find on the web</button> : null}
                      <button onClick={() => clear(f.id, "resolved")} disabled={busy === f.id} className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-ink-900 shadow-sm hover:bg-canvas">Resolved</button>
                      <button onClick={() => clear(f.id, "dismissed")} disabled={busy === f.id} className="rounded-lg px-2.5 py-1 text-xs font-medium text-ink-500 hover:bg-white">Dismiss</button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {p.notes.length || p.skipped.length ? (
        <div className="border-t border-line px-5 py-3 md:px-6">
          <button onClick={() => setShowNotes((s) => !s)} className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900">
            <Info size={14} /> {p.notes.length} adjustment{p.notes.length === 1 ? "" : "s"} the app made{p.skipped.length ? `, ${p.skipped.length} contact${p.skipped.length === 1 ? "" : "s"} skipped` : ""}
          </button>
          {showNotes ? (
            <ul className="mt-2 grid gap-1 text-sm text-ink-500">
              {p.notes.map((n, i) => <li key={`n${i}`}>{n.text}</li>)}
              {p.skipped.map((s, i) => <li key={`s${i}`}>Skipped {s.contactRef}: {s.reason}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
