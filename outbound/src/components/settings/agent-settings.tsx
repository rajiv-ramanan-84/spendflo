"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SaveBar, toast } from "@/components/settings/kit";
import type { AgentConfig } from "@/lib/agent/config";
import { stateOf } from "@/lib/agent/config";

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm disabled:bg-canvas";

function Bar({ label, spent, cap, unit, warnPct }: { label: string; spent: number; cap: number; unit: string; warnPct: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 100;
  const st = stateOf(spent, cap, warnPct);
  const color = st === "stop" ? "bg-rose-500" : st === "warn" ? "bg-amber-500" : "bg-brand-500";
  const f = (n: number) => (unit === "$" ? `$${n.toFixed(2)}` : `${Math.round(n * 10) / 10}`);
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm"><span className="font-medium">{label}</span><span className="tabular-nums text-ink-500">{f(spent)} of {unit === "$" ? `$${cap}` : cap}{unit === "$" ? "" : " credits"} · {pct}%</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas"><div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function AgentSettings({ cfg, usd, credits, canEdit }: { cfg: AgentConfig; usd: number; credits: number; canEdit: boolean }) {
  const router = useRouter();
  const [base, setBase] = useState<AgentConfig>({ ...cfg });
  const [v, setV] = useState<AgentConfig>({ ...cfg });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const changed = (Object.keys(v) as Array<keyof AgentConfig>).filter((k) => v[k] !== base[k]).length;
  const set = <K extends keyof AgentConfig>(k: K, x: AgentConfig[K]) => setV((s) => ({ ...s, [k]: x }));
  const num = (k: keyof AgentConfig) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === "" ? 0 : Number(e.target.value)) as never);

  async function save() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/settings/agent", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ patch: v }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Network problem" }));
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setBase({ ...v });
    toast("Assistant settings saved. The change is in the audit log.");
    router.refresh();
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="sr-only">Assistant</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-500">The chat drawer on every page. It reads your data and uses the integrations below. It proposes changes and spends nothing past these limits. Each month starts fresh.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={v.enabled} disabled={!canEdit} onChange={(e) => set("enabled", e.target.checked)} className="h-4 w-4" /> Switched on
        </label>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Bar label="Claude this month" spent={usd} cap={cfg.claudeMonthlyUsd} unit="$" warnPct={cfg.warnPct} />
        <Bar label="Tapistro credits this month" spent={credits} cap={cfg.tapistroMonthlyCredits} unit="credits" warnPct={cfg.warnPct} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <label className="grid gap-1.5 text-sm"><span className="font-medium">Claude per month ($)</span><input className={input} type="number" min={0} step="1" value={v.claudeMonthlyUsd} disabled={!canEdit} onChange={num("claudeMonthlyUsd")} /></label>
        <label className="grid gap-1.5 text-sm"><span className="font-medium">Tapistro credits per month</span><input className={input} type="number" min={0} step="10" value={v.tapistroMonthlyCredits} disabled={!canEdit} onChange={num("tapistroMonthlyCredits")} /></label>
        <label className="grid gap-1.5 text-sm"><span className="font-medium">Warn at (%)</span><input className={input} type="number" min={10} max={99} value={v.warnPct} disabled={!canEdit} onChange={num("warnPct")} /></label>
        <label className="grid gap-1.5 text-sm"><span className="font-medium">Most one request may cost ($)</span><input className={input} type="number" min={0.05} step="0.5" value={v.runCapUsd} disabled={!canEdit} onChange={num("runCapUsd")} /></label>
        <label className="grid gap-1.5 text-sm"><span className="font-medium">Most credits one request may use</span><input className={input} type="number" min={0} step="10" value={v.runCapCredits} disabled={!canEdit} onChange={num("runCapCredits")} /></label>
        <label className="grid gap-1.5 text-sm"><span className="font-medium">Steps per request</span><input className={input} type="number" min={1} max={20} value={v.maxTurns} disabled={!canEdit} onChange={num("maxTurns")} /></label>
        <label className="grid gap-1.5 text-sm md:col-span-3 md:max-w-xs"><span className="font-medium">Model</span>
          <select className={input} value={v.model} disabled={!canEdit} onChange={(e) => set("model", e.target.value as AgentConfig["model"])}>
            <option value="claude-sonnet-5-5">Sonnet (balanced, recommended)</option>
            <option value="claude-haiku-5-5">Haiku (cheapest, simpler answers)</option>
            <option value="claude-opus-5-5">Opus (deepest, about twice the cost)</option>
          </select>
        </label>
      </div>

      {canEdit ? <SaveBar dirty={changed > 0} busy={busy} count={changed} error={err} onSave={save} onDiscard={() => { setV({ ...base }); setErr(null); }} /> : <p className="mt-5 text-sm text-ink-500">Only admins can change these.</p>}
      <p className="mt-4 text-sm"><Link href="/agent" className="text-brand-700 hover:underline">See traces and the audit log</Link></p>
    </Card>
  );
}
