"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DRAFT_MODELS } from "@/lib/claude/models";
import { cn } from "@/lib/cn";

type Item = { accountId: string; name: string; reason: string | null; level: string | null; model: string };
type Plan = { willGenerate: Item[]; nurture: Item[]; replaceable: Item[]; skipped: Item[]; max: number; estimateUsd: number; remainingUsd: number };
type Result = { queued: number; names: string[]; skipped: Item[]; estimateUsd: number };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const usd = (n: number) => `$${n.toFixed(2)}`;
const modelLabel = (id: string) => DRAFT_MODELS.find((m) => m.id === id)?.label ?? "Claude";

/**
 * Generate drafts for the selected accounts. Shows who gets a draft, who is skipped and why, and what it costs,
 * then sends them to Claude as one half-price batch. Existing drafts are never replaced.
 */
export function GenerateDialog({ accountIds, onClose, onQueued }: { accountIds: string[]; onClose: () => void; onQueued: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withNurture, setWithNurture] = useState(false);
  const [replace, setReplace] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/accounts/bulk-generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountIds, preview: true }) })
      .then((r) => r.json())
      .then((d) => { if (!live) return; if (d.ok) setPlan(d.plan as Plan); else setError(d.error); })
      .catch(() => live && setError("Could not check these accounts. Try again."));
    return () => { live = false; };
  }, [accountIds]);

  const close = () => {
    if (busy) return;
    if (result) onQueued();
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) { if (result) onQueued(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, result, onClose, onQueued]);
  useEffect(() => { box.current?.focus(); }, []);

  const picked = plan ? [...plan.willGenerate, ...(replace ? plan.replaceable : []), ...(withNurture ? plan.nurture : [])] : [];
  const count = picked.length;
  const cost = plan ? Math.round(picked.reduce((s, i) => s + (DRAFT_MODELS.find((m) => m.id === i.model)?.perDraftUsd ?? 0.25), 0) * 100) / 100 : 0;
  const overBudget = !!plan && cost > plan.remainingUsd;

  async function go() {
    setBusy(true); setError(null);
    const res = await fetch("/api/accounts/bulk-generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountIds, includeNurture: withNurture, replaceDrafts: replace }) });
    const d = await res.json().catch(() => ({ ok: false, error: "No response" }));
    setBusy(false);
    if (!d.ok) return setError(d.error);
    setResult(d as Result);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="gen-title" className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl outline-none">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 id="gen-title" className="text-lg font-semibold">{result ? "Sent to Claude" : "Generate drafts"}</h2>
          <button aria-label="Close" onClick={close} disabled={busy} className="rounded-lg p-1 text-ink-400 hover:bg-canvas hover:text-ink-900"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-3 text-sm">
          {!plan && !error ? <p className="text-ink-500">Checking {plural(accountIds.length, "account")}…</p> : null}
          {error ? <p role="alert" className="rounded-lg bg-brand-50 px-3 py-2 text-brand-700">{error}</p> : null}

          {plan && !result ? (
            <div className="flex flex-col gap-4">
              {plan.willGenerate.length ? (
                <section>
                  <h3 className="flex items-center gap-1.5 font-semibold text-emerald-700"><Check size={15} />{plural(plan.willGenerate.length, "draft")} will be written</h3>
                  <p className="mt-0.5 text-ink-600">{plan.willGenerate.map((i) => i.name).join(", ")}</p>
                </section>
              ) : null}
              {plan.nurture.length ? (
                <label className="flex items-start gap-2 rounded-xl border border-line p-3">
                  <input type="checkbox" className="mt-0.5 accent-brand-500" checked={withNurture} onChange={(e) => setWithNurture(e.target.checked)} />
                  <span><b>Also draft {plural(plan.nurture.length, "Nurture account")}</b><span className="block text-ink-600">{plan.nurture.map((i) => i.name).join(", ")}. They have no live signal, so the draft is a short, low-key sequence.</span></span>
                </label>
              ) : null}
              {plan.replaceable.length ? (
                <label className="flex items-start gap-2 rounded-xl border border-line p-3">
                  <input type="checkbox" className="mt-0.5 accent-brand-500" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                  <span><b>Replace {plural(plan.replaceable.length, "existing draft")} with a new one</b><span className="block text-ink-600">{plan.replaceable.map((i) => i.name).join(", ")}. Use this to rewrite drafts in the latest style. Drafts you have edited by hand are never replaced, and live campaigns are not touched. The old draft stays in the history.</span></span>
                </label>
              ) : null}
              {count ? (
                <p className="rounded-xl bg-canvas px-3 py-2 text-ink-700">About <b>{usd(cost)}</b> using {[...new Set(picked.map((i) => modelLabel(i.model)))].join(" and ")}, at half price through the batch service. Drafts appear as Draft ready in about 5 to 10 minutes. You have {usd(Math.max(0, plan.remainingUsd))} left this month.</p>
              ) : null}
              {overBudget ? <p className="flex items-start gap-1.5 text-amber-900"><AlertTriangle size={15} className="mt-0.5 shrink-0" />This is more than the budget you have left this month. An admin can raise it in Settings.</p> : null}
              {plan.skipped.length ? (
                <section>
                  <h3 className="font-semibold text-ink-700">Not generating ({plan.skipped.length})</h3>
                  <ul className="mt-0.5 text-ink-600">{plan.skipped.map((i) => <li key={i.accountId}>{i.name}: {i.reason}</li>)}</ul>
                </section>
              ) : null}
              {!plan.willGenerate.length && !plan.nurture.length && !plan.replaceable.length ? <p className="text-ink-600">None of these accounts can get a draft right now.</p> : null}
            </div>
          ) : null}

          {result ? (
            <div className="flex flex-col gap-3">
              {result.queued ? <p className="text-emerald-700"><b>{plural(result.queued, "draft")} sent to Claude:</b> {result.names.join(", ")}. They appear as Draft ready in about 5 to 10 minutes. Nothing launches until you do.</p> : <p className="text-ink-600">Nothing was queued.</p>}
            </div>
          ) : null}
        </div>

        <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3", busy && "opacity-70")}>
          {result ? <Button onClick={close}>Close</Button> : (
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
              {count ? <Button onClick={go} disabled={busy || overBudget}>{busy ? "Sending…" : `Generate ${plural(count, "draft")}`}</Button> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
