"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = { spent: number; pending: number; budget: number; drafts: number; autoDraft: "off" | "a" | "ab"; canEdit: boolean };

const AUTO = [
  ["off", "Only when someone clicks Generate"],
  ["a", "Also new Tier A accounts after each sync"],
  ["ab", "Also new Tier A and B accounts after each sync"],
] as const;

export function ClaudeSpend(p: Props) {
  const router = useRouter();
  const [autoDraft, setAutoDraft] = useState(p.autoDraft);
  const [budget, setBudget] = useState(String(p.budget));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const used = p.spent + p.pending;
  const pct = p.budget > 0 ? Math.min(100, Math.round((used / p.budget) * 100)) : 100;

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings/claude", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ autoDraft, budget: Number(budget) }) });
    const data = await res.json().catch(() => ({ ok: false, error: "No response" }));
    setBusy(false);
    if (!data.ok) return setMsg({ ok: false, text: data.error });
    setMsg({ ok: true, text: data.dropped ? `Saved. ${data.dropped} queued draft${data.dropped === 1 ? "" : "s"} nobody asked for were dropped.` : "Saved." });
    router.refresh();
  }

  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-lg font-semibold">Claude spend</h2>
      <p className="mt-1 text-sm text-ink-500">Drafts are the only real cost (about $0.13 for Tier B to D, $0.27 for Tier A). Sorting a reply costs a fraction of a cent and never stops.</p>

      <div className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span><span className="text-2xl font-semibold tabular-nums">${used.toFixed(2)}</span> <span className="text-ink-500">of ${p.budget} this month</span></span>
          <span className="text-ink-400">{p.drafts} draft{p.drafts === 1 ? "" : "s"} so far{p.pending ? ` · $${p.pending.toFixed(2)} still being written` : ""}</span>
        </div>
        <div className="mt-2 h-2 rounded-[4px] bg-canvas"><div className={`h-2 rounded-[4px] ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} /></div>
        {pct >= 100 ? <p className="mt-2 text-sm text-rose-700">Budget reached: new drafts and re-plans are paused until next month or until an admin raises it.</p> : null}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <fieldset className="grid gap-2 text-sm">
          <legend className="mb-1 font-medium">Write drafts</legend>
          {AUTO.map(([v, label]) => (
            <label key={v} className="inline-flex items-center gap-2">
              <input type="radio" name="autoDraft" className="accent-brand-500" checked={autoDraft === v} disabled={!p.canEdit} onChange={() => setAutoDraft(v)} /> {label}
            </label>
          ))}
        </fieldset>
        <label className="grid content-start gap-1.5 text-sm">
          <span className="font-medium">Monthly budget (USD)</span>
          <input type="number" min={0} step={5} value={budget} disabled={!p.canEdit} onChange={(e) => setBudget(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm disabled:bg-canvas" />
          <span className="text-xs text-ink-400">Drafts and re-plans pause when reached.</span>
        </label>
      </div>

      {msg ? <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p> : null}
      {p.canEdit ? (
        <div className="mt-4 flex justify-end"><Button onClick={save} disabled={busy}><Check size={16} /> {busy ? "Saving..." : "Save"}</Button></div>
      ) : <p className="mt-4 text-xs text-ink-400">Admins can change these.</p>}
    </Card>
  );
}
