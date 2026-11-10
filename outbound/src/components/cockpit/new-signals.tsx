"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";

export type NewSignal = { id: string; name: string; seenOn: string | null; evidence: string; url: string | null };

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return res.json().catch(() => ({ ok: false, error: "No response" }));
}

/**
 * New signals arrived after this plan was written. A draft can be regenerated; a live campaign is never
 * rewritten on its own, the owner chooses to re-plan, and the re-plan sees everything already done.
 */
export function NewSignalsBanner({ accountId, campaignId, live, signals, canEdit }: { accountId: string; campaignId: string; live: boolean; signals: NewSignal[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"plan" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!signals.length) return null;

  async function replan() {
    setBusy("plan"); setError(null);
    const summary = signals.map((s) => `${s.name} (${s.seenOn ?? "undated"}): ${s.evidence}`).join(" | ").slice(0, 1500);
    const d = live
      ? await post(`/api/campaigns/${campaignId}/replan`, { scope: "campaign", ownerNextStep: `New signals arrived after this plan was written. Update the open steps to use them where they help: ${summary}` })
      : await post(`/api/accounts/${accountId}/generate`, {});
    if (!d.ok) { setBusy(null); return setError(d.error); }
    await post(`/api/accounts/${accountId}/signals-reviewed`);
    setBusy(null);
    if (live) window.location.hash = "activity";
    router.refresh();
  }
  async function dismiss() {
    setBusy("dismiss");
    await post(`/api/accounts/${accountId}/signals-reviewed`);
    setBusy(null);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4" aria-label="New signals">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-brand-700"><Radio size={15} />{signals.length} new signal{signals.length === 1 ? "" : "s"} since this {live ? "campaign was planned" : "draft was written"}</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {signals.slice(0, 4).map((s) => (
              <li key={s.id} className="min-w-0">
                <span className="font-medium text-ink-900">{s.name}</span>
                <span className="text-ink-500"> · {s.seenOn ? fmtDate(s.seenOn) : "undated"}</span>
                <span className="block text-ink-700">{s.evidence}{s.url ? <> <a href={s.url} target="_blank" rel="noreferrer" className="text-brand-700 underline">source</a></> : null}</span>
              </li>
            ))}
            {signals.length > 4 ? <li className="text-ink-500">and {signals.length - 4} more</li> : null}
          </ul>
          <p className="mt-2 text-xs text-ink-500">{live ? "Nothing changes on its own. A re-plan keeps every step already sent, every reply and every skip, and only reshapes what is still open." : "Regenerating writes a new draft with these signals and replaces this one."}</p>
        </div>
        {canEdit ? (
          <div className="flex flex-col items-end gap-2">
            <Button onClick={replan} disabled={busy !== null}>{busy === "plan" ? "Working with Claude…" : live ? "Re-plan with new signals" : "Regenerate draft"}</Button>
            <button onClick={dismiss} disabled={busy !== null} className="text-xs text-ink-500 underline hover:text-ink-900">Leave the plan as it is</button>
          </div>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p> : null}
    </section>
  );
}
