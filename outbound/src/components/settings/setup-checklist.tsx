"use client";

import { useState } from "react";
import { Check, ChevronDown, ExternalLink, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ChecklistItem } from "@/lib/checklist/items";

/** Get set up: a short to-do list. Tick an item and it leaves the list; Undo brings it back. */
export function SetupChecklist({ items, total }: { items: ChecklistItem[]; total: number }) {
  const [open, setOpen] = useState(items);
  const [gone, setGone] = useState<ChecklistItem | null>(null);
  const [expanded, setExpanded] = useState<string | null>(items[0]?.key ?? null);
  const [err, setErr] = useState<string | null>(null);

  async function set(it: ChecklistItem, done: boolean) {
    setErr(null);
    const res = await fetch("/api/checklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: it.key, done }) }).then((r) => r.json()).catch(() => ({ ok: false }));
    if (!res.ok) return setErr("Could not save that. Try again.");
    if (done) { setOpen((l) => l.filter((x) => x.key !== it.key)); setGone(it); }
    else { setOpen((l) => [...l, it].sort((a, b) => a.key.localeCompare(b.key))); setGone(null); }
  }

  if (!open.length) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><Check className="h-4 w-4" /> You are all set. Nothing left to set up.</p>
        {gone ? <button onClick={() => set(gone, false)} className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900"><Undo2 className="h-3.5 w-3.5" /> Undo</button> : null}
      </Card>
    );
  }
  const done = total - open.length;
  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Get set up</h2>
          <p className="mt-0.5 text-sm text-ink-500">{open.length} thing{open.length === 1 ? "" : "s"} left to get the most out of the app. Tick one when it is done and it leaves the list.</p>
        </div>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-canvas" aria-hidden><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></div>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {open.map((it) => {
          const isOpen = expanded === it.key;
          return (
            <li key={it.key} className="py-3">
              <div className="flex items-start gap-3">
                <button onClick={() => set(it, true)} aria-label={`Mark done: ${it.title}`} className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-ink-300 bg-white hover:border-brand-500 hover:bg-brand-50"><Check className="h-3.5 w-3.5 text-transparent hover:text-brand-600" /></button>
                <div className="min-w-0 flex-1">
                  <button onClick={() => setExpanded(isOpen ? null : it.key)} className="flex w-full items-center justify-between gap-2 text-left">
                    <span className="text-sm font-medium">{it.title}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen ? (
                    <div className="mt-2 grid gap-2 text-sm text-ink-600">
                      <p>{it.why}</p>
                      <ol className="ml-4 list-decimal space-y-1 text-ink-500">{it.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                      {it.link ? <a href={it.link.href} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline">{it.link.label} <ExternalLink className="h-3.5 w-3.5" /></a> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {gone ? <p className="mt-3 flex items-center gap-2 text-xs text-ink-500">Done: {gone.title}. <button onClick={() => set(gone, false)} className="inline-flex items-center gap-1 font-medium text-ink-700 hover:underline"><Undo2 className="h-3 w-3" /> Undo</button></p> : null}
      {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
    </Card>
  );
}
