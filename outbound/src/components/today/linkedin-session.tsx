"use client";

import { useState } from "react";
import { Copy, X } from "lucide-react";
import type { TodayStep } from "@/lib/data/today";
import { Button } from "@/components/ui/button";
import { ChannelTag } from "@/components/ui/channel";
import { copyPrepared } from "./step-row";

/** LinkedIn session (PRD M7): copy note, open profile, mark done, next. */
export function LinkedInSession({ steps, onClose, onDone }: { steps: TodayStep[]; onClose: () => void; onDone: (id: string) => void }) {
  const [i, setI] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const s = steps[i];

  async function copyOpen() {
    setError(null);
    const r = await copyPrepared(s.id);
    if (!r.ok) return setError(r.error);
    setText(r.body);
    if (r.linkedinUrl) window.open(r.linkedinUrl, "_blank", "noopener");
  }

  async function markDoneNext() {
    const res = await fetch(`/api/steps/${s.id}/done`, { method: "POST" });
    const data = await res.json();
    if (!data.ok) return setError(data.error);
    onDone(s.id);
    setDone((d) => d + 1);
    next();
  }

  function next() {
    setText(null);
    setError(null);
    if (i + 1 >= steps.length) onClose(); else setI(i + 1);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/30 md:items-center md:p-6">
      <div role="dialog" aria-label="LinkedIn session" className="w-full max-w-lg rounded-t-2xl bg-white shadow-[var(--shadow-lift)] md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">LinkedIn session</div>
            <div className="text-sm text-ink-500">{i + 1} of {steps.length} · {done} done</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-ink-400 hover:bg-canvas"><X size={18} /></button>
        </div>
        {s ? (
          <div className="px-5 py-4">
            <div className="text-lg font-semibold">{s.contact.full_name}</div>
            <div className="text-sm text-ink-500">{s.contact.title} · {s.account.name}</div>
            <div className="mt-2"><ChannelTag channel={s.channel} /></div>
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-canvas p-3 text-sm leading-relaxed text-ink-700">{text ?? s.body}</p>
            {error ? <div role="alert" className="mt-2 text-sm text-brand-700">{error}</div> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={next}>Skip for now</Button>
              <Button variant="secondary" onClick={copyOpen}><Copy size={14} />Copy and open profile</Button>
              <Button onClick={markDoneNext}>Done, next</Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
