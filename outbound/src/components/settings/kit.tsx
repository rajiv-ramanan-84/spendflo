"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Shared pieces of the editing pattern: a sticky save bar that appears only when something changed, and toasts. */

export function toast(text: string, kind: "ok" | "error" = "ok") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("settings-toast", { detail: { text, kind } }));
}

export function ToastHost() {
  const [items, setItems] = useState<Array<{ id: number; text: string; kind: "ok" | "error" }>>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; kind: "ok" | "error" }>).detail;
      const id = Date.now() + Math.random();
      setItems((l) => [...l.slice(-2), { id, ...d }]);
      window.setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), d.kind === "error" ? 7000 : 3500);
    };
    window.addEventListener("settings-toast", on);
    return () => window.removeEventListener("settings-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[60] grid gap-2 md:bottom-6" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cn("pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm shadow-lg", t.kind === "ok" ? "border-emerald-200 bg-white text-ink-900" : "border-rose-200 bg-rose-50 text-rose-800")}>
          {t.kind === "ok" ? <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <CircleAlert size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{t.text}</span>
          <button onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="text-ink-400 hover:text-ink-900"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

/** Warns before leaving the page with unsaved changes. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}

/** Sticks to the bottom of its card, only while there is something to save. */
export function SaveBar({ dirty, busy, onSave, onDiscard, count, error }: { dirty: boolean; busy: boolean; onSave: () => void; onDiscard: () => void; count?: number; error?: string | null }) {
  useUnsavedWarning(dirty);
  if (!dirty && !error) return null;
  return (
    <div className="sticky bottom-3 z-10 mt-6" role="region" aria-label="Unsaved changes">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-900/10 bg-ink-900 px-4 py-3 text-sm text-white shadow-xl">
        <span className="min-w-0">{error ? <span className="text-rose-200">{error}</span> : <>{count && count > 1 ? `${count} unsaved changes` : "Unsaved changes"}</>}</span>
        <span className="flex items-center gap-2">
          <button onClick={onDiscard} disabled={busy} className="rounded-lg px-3 py-1.5 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50">Discard</button>
          <Button onClick={onSave} disabled={busy || !dirty}>{busy ? "Saving..." : "Save changes"}</Button>
        </span>
      </div>
    </div>
  );
}

export function Chip({ tone, children }: { tone: "ok" | "warn" | "bad" | "off"; children: React.ReactNode }) {
  const c = { ok: "bg-emerald-50 text-emerald-700", warn: "bg-amber-50 text-amber-800", bad: "bg-rose-50 text-rose-700", off: "bg-canvas text-ink-500" }[tone];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", c)}>{children}</span>;
}
