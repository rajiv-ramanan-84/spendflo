"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { SaveBar, toast } from "@/components/settings/kit";
import { DRAFT_MODELS } from "@/lib/claude/models";

type Props = { spent: number; pending: number; budget: number; drafts: number; autoDraft: "off" | "a" | "ab"; defaultModel: string; tierAModel: string; bulkMax: number; canEdit: boolean };

const AUTO = [
  ["off", "Only when someone clicks Generate"],
  ["a", "Also new Tier A accounts after each sync"],
  ["ab", "Also new Tier A and B accounts after each sync"],
] as const;

export function ClaudeSpend(p: Props) {
  const router = useRouter();
  const [autoDraft, setAutoDraft] = useState(p.autoDraft);
  const [budget, setBudget] = useState(String(p.budget));
  const [defaultModel, setDefaultModel] = useState(p.defaultModel);
  const [tierAModel, setTierAModel] = useState(p.tierAModel);
  const [bulkMax, setBulkMax] = useState(String(p.bulkMax));
  const [base, setBase] = useState({ autoDraft: p.autoDraft, budget: String(p.budget), defaultModel: p.defaultModel, tierAModel: p.tierAModel, bulkMax: String(p.bulkMax) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cur = { autoDraft, budget, defaultModel, tierAModel, bulkMax };
  const changed = (Object.keys(cur) as Array<keyof typeof cur>).filter((k) => cur[k] !== base[k]).length;
  const used = p.spent + p.pending;
  const pct = p.budget > 0 ? Math.min(100, Math.round((used / p.budget) * 100)) : 100;

  async function save() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/settings/claude", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ autoDraft, budget: Number(budget), defaultModel, tierAModel, bulkMax: Number(bulkMax) }) });
    const data = await res.json().catch(() => ({ ok: false, error: "No response" }));
    setBusy(false);
    if (!data.ok) return setErr(data.error);
    setBase({ ...cur });
    toast(data.dropped ? `Saved. ${data.dropped} queued draft${data.dropped === 1 ? "" : "s"} nobody asked for were dropped.` : "Drafting settings saved.");
    router.refresh();
  }

  return (
    <Card className="p-5 md:p-6">
      <h2 className="sr-only">Drafting and models</h2>
      <p className="mt-1 text-sm text-ink-500">Drafts are the only real cost. Sorting a reply costs a fraction of a cent and never stops. Drafts run through the half-price batch service.</p>

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

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {([["Model for Tier B to D accounts", defaultModel, setDefaultModel], ["Model for Tier A accounts", tierAModel, setTierAModel]] as const).map(([label, value, set]) => (
          <label key={label} className="grid content-start gap-1.5 text-sm">
            <span className="font-medium">{label}</span>
            <select value={value} disabled={!p.canEdit} onChange={(e) => set(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm disabled:bg-canvas">
              {DRAFT_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}, about ${m.perDraftUsd.toFixed(2)} a draft</option>)}
            </select>
            <span className="text-xs text-ink-400">{DRAFT_MODELS.find((m) => m.id === value)?.note}</span>
          </label>
        ))}
        <label className="grid content-start gap-1.5 text-sm">
          <span className="font-medium">Most accounts per bulk generate</span>
          <input type="number" min={1} max={25} value={bulkMax} disabled={!p.canEdit} onChange={(e) => setBulkMax(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm disabled:bg-canvas" />
          <span className="text-xs text-ink-400">Caps how many drafts one click can queue, 1 to 25.</span>
        </label>
      </div>

      {p.canEdit ? <SaveBar dirty={changed > 0} busy={busy} count={changed} error={err} onSave={save} onDiscard={() => { setAutoDraft(base.autoDraft); setBudget(base.budget); setDefaultModel(base.defaultModel); setTierAModel(base.tierAModel); setBulkMax(base.bulkMax); setErr(null); }} /> : <p className="mt-4 text-xs text-ink-400">Admins can change these.</p>}
    </Card>
  );
}
