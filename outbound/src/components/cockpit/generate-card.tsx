"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function GenerateCard({ accountId, canGenerate, usableContacts }: { accountId: string; canGenerate: boolean; usableContacts: number }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/accounts/${accountId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ownerNotes: notes || undefined }) });
    const data = await res.json().catch(() => ({ ok: false, error: "No response" }));
    setBusy(false);
    if (!data.ok) return setError(data.error ?? "Generation failed");
    router.refresh();
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-[15px] font-semibold">No campaign yet</h2>
          <p className="mt-1 text-sm text-ink-500">
            Claude plans one track per contact with real working dates, channels and copy. It lands as a draft for you to review. Nothing goes out until you launch, and you send every touch.
          </p>
        </div>
        <span className="text-xs text-ink-400">{usableContacts} usable contact{usableContacts === 1 ? "" : "s"}</span>
      </div>
      {canGenerate ? (
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1">
            <span className="text-xs font-medium text-ink-500">Notes for Claude (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="For example: lead with redlining, Sid takes the CFO"
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-300"
            />
          </label>
          <Button onClick={generate} disabled={busy || usableContacts === 0}>
            <Wand2 size={16} />{busy ? "Writing the campaign… about 3 minutes" : "Generate campaign"}
          </Button>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <span>{error}</span>
          <button onClick={generate} className="font-medium underline">Retry</button>
        </div>
      ) : null}
    </Card>
  );
}
