"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Item = { accountId: string; name: string; flags: string[]; reason: string | null };
type Plan = { ready: Item[]; flagged: Item[]; skipped: Item[] };
type Result = { launched: string[]; failed: Array<{ name: string; error: string }>; heldForFlags: string[]; skipped: Item[] };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Launch campaigns for the selected accounts. Shows what will happen first. When some accounts still have
 * open review flags, says so and lets the owner launch the clean ones or override and launch all.
 */
export function LaunchDialog({ accountIds, onClose, onLaunched }: { accountIds: string[]; onClose: () => void; onLaunched: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/campaigns/bulk-launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountIds, preview: true }) })
      .then((r) => r.json())
      .then((d) => { if (!live) return; if (d.ok) setPlan(d.plan as Plan); else setError(d.error); })
      .catch(() => live && setError("Could not check these accounts. Try again."));
    return () => { live = false; };
  }, [accountIds]);

  // Closing after a launch also refreshes the list behind the dialog.
  const close = () => {
    if (busy) return;
    if (result) onLaunched();
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) { if (result) onLaunched(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, result, onClose, onLaunched]);
  useEffect(() => { box.current?.focus(); }, []);

  async function launch(overrideFlags: boolean) {
    setBusy(true); setError(null);
    const res = await fetch("/api/campaigns/bulk-launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountIds, overrideFlags }) });
    const d = await res.json().catch(() => ({ ok: false, error: "No response" }));
    setBusy(false);
    if (!d.ok) return setError(d.error);
    setResult(d as Result);
  }

  const nothing = plan && !plan.ready.length && !plan.flagged.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="launch-title" className="flex outline-none max-h-[88dvh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 id="launch-title" className="text-lg font-semibold">{result ? "Done" : "Launch campaigns"}</h2>
          <button aria-label="Close" onClick={close} disabled={busy} className="rounded-lg p-1 text-ink-400 hover:bg-canvas hover:text-ink-900"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-3 text-sm">
          {!plan && !error ? <p className="text-ink-500">Checking {plural(accountIds.length, "account")}…</p> : null}
          {error ? <p role="alert" className="rounded-lg bg-brand-50 px-3 py-2 text-brand-700">{error}</p> : null}

          {plan && !result ? (
            <div className="flex flex-col gap-4">
              {plan.ready.length ? (
                <section>
                  <h3 className="flex items-center gap-1.5 font-semibold text-emerald-700"><Check size={15} />{plural(plan.ready.length, "campaign")} ready</h3>
                  <p className="mt-0.5 text-ink-600">{plan.ready.map((i) => i.name).join(", ")}</p>
                </section>
              ) : null}
              {plan.flagged.length ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <h3 className="flex items-center gap-1.5 font-semibold text-amber-900"><AlertTriangle size={15} />Flags you should be aware of</h3>
                  <p className="mt-0.5 text-amber-900">{plural(plan.flagged.length, "account")} still {plan.flagged.length === 1 ? "has" : "have"} open review flags. You can override and launch anyway.</p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {plan.flagged.map((i) => (
                      <li key={i.accountId}>
                        <div className="font-medium text-ink-900">{i.name}</div>
                        <ul className="list-disc pl-5 text-xs text-ink-700">{i.flags.slice(0, 3).map((f) => <li key={f}>{f}</li>)}{i.flags.length > 3 ? <li>and {i.flags.length - 3} more</li> : null}</ul>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {plan.skipped.length ? (
                <section>
                  <h3 className="font-semibold text-ink-700">Not launching ({plan.skipped.length})</h3>
                  <ul className="mt-0.5 text-ink-600">{plan.skipped.map((i) => <li key={i.accountId}>{i.name}: {i.reason}</li>)}</ul>
                </section>
              ) : null}
              {nothing ? <p className="text-ink-600">None of these accounts can launch right now. Open an account to finish its draft.</p> : null}
            </div>
          ) : null}

          {result ? (
            <div className="flex flex-col gap-3">
              {result.launched.length ? <p className="text-emerald-700"><b>Launched {plural(result.launched.length, "campaign")}:</b> {result.launched.join(", ")}. Their first steps are on the Tasks page.</p> : <p className="text-ink-600">Nothing was launched.</p>}
              {result.heldForFlags.length ? <p className="text-amber-900">Held back for flags: {result.heldForFlags.join(", ")}.</p> : null}
              {result.failed.length ? <ul role="alert" className="rounded-lg bg-brand-50 px-3 py-2 text-brand-700">{result.failed.map((f) => <li key={f.name}>{f.name}: {f.error}</li>)}</ul> : null}
            </div>
          ) : null}
        </div>

        <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3", busy && "opacity-70")}>
          {result ? (
            <Button onClick={close}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
              {plan && plan.flagged.length ? (
                <>
                  {plan.ready.length ? <Button variant="secondary" onClick={() => launch(false)} disabled={busy}>{busy ? "Launching…" : `Launch ${plan.ready.length} without flags`}</Button> : null}
                  <Button onClick={() => launch(true)} disabled={busy}>{busy ? "Launching…" : `Override and launch ${plan.ready.length + plan.flagged.length}`}</Button>
                </>
              ) : plan && plan.ready.length ? (
                <Button onClick={() => launch(false)} disabled={busy}>{busy ? "Launching…" : `Launch ${plan.ready.length}`}</Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
