"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CircleAlert, Gauge, X } from "lucide-react";
import { bannerFor } from "@/lib/sending/rules";
import { cn } from "@/lib/cn";
import { InboxLine, Meter, TONE, type InboxView } from "./ui";

/**
 * Sending, kept quiet: a small meter beside the Today tabs, and one banner only when something needs attention.
 * The meter opens a panel with every inbox the person can send from.
 */
export function SendingMeter({ inboxes, canTune }: { inboxes: InboxView[]; canTune: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", esc); };
  }, [open]);

  const main = inboxes.find((i) => i.isDefault) ?? inboxes[0];
  if (!main) return null;
  const worst = inboxes.some((i) => i.state === "full" && !i.paused) ? "full" : inboxes.some((i) => i.state === "warn" && !i.paused) ? "warn" : "ok";

  return (
    <>
      <div ref={ref} className="relative">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-44 items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-1.5 text-left hover:border-brand-200" title="Emails sent today from your inboxes">
          <Gauge size={15} className={cn("shrink-0", worst === "ok" ? "text-ink-400" : TONE[worst].text)} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs leading-tight text-ink-500">Sent today</span>
            <span className="block text-sm font-semibold leading-tight">{main.sent} <span className="font-normal text-ink-400">of {main.max}</span></span>
            <Meter className="mt-1" sent={main.sent} queued={main.queued} warn={main.warn} max={main.max} state={main.state} />
          </span>
        </button>
        {open ? (
          <div className="absolute right-0 z-30 mt-2 w-[min(92vw,26rem)] rounded-2xl border border-line bg-white p-4 shadow-xl" role="dialog" aria-label="Sending today">
            <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Sending today</span><button onClick={() => setOpen(false)} aria-label="Close" className="text-ink-400 hover:text-ink-900"><X size={15} /></button></div>
            <div className="grid gap-4">{inboxes.map((i) => <InboxLine key={i.key} i={i} />)}</div>
            <p className="mt-3 border-t border-line pt-3 text-xs text-ink-500">Counts reset at midnight IST. The tick marks {main.warn}: past it, more mail from one address puts the domain at risk.</p>
            <div className="mt-2 flex gap-4 text-xs font-medium">
              <Link href="/settings/me" className="text-brand-700 hover:underline">Connect another inbox</Link>
              {canTune ? <Link href="/settings/team/mailboxes" className="text-brand-700 hover:underline">Sending limits</Link> : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

const DISMISS_EVENT = "sending-banner-dismissed";
const subscribe = (cb: () => void) => { window.addEventListener(DISMISS_EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(DISMISS_EVENT, cb); window.removeEventListener("storage", cb); }; };
/** Whether this banner was dismissed today. Reads browser storage without setting state in an effect; storage can be blocked, so failures mean "not dismissed". */
function useDismissed(key: string | null) {
  return useSyncExternalStore(subscribe, () => { try { return !!key && window.localStorage.getItem(key) === "1"; } catch { return false; } }, () => false);
}

/** The single banner. Amber and red are for real problems; the early heads-up is softer and can be dismissed for the day. */
export function SendingBanner({ inboxes, day }: { inboxes: InboxView[]; day: string }) {
  const banner = bannerFor(inboxes);
  const key = banner ? `sendingBanner:${day}:${banner.email}:${banner.tone}` : null;
  const dismissed = useDismissed(key);
  if (!banner || (dismissed && banner.tone !== "full")) return null;
  const style = banner.tone === "full" ? "border-rose-200 bg-rose-50 text-rose-900" : banner.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-200 bg-brand-50/60 text-ink-900";
  return (
    <div role={banner.tone === "heads_up" ? "status" : "alert"} className={cn("mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm", style)}>
      <CircleAlert size={16} className="mt-0.5 shrink-0" />
      <span className="flex-1">{banner.text}</span>
      {banner.tone !== "full" ? (
        <button aria-label="Dismiss for today" onClick={() => { try { window.localStorage.setItem(key!, "1"); } catch { /* ignore */ } window.dispatchEvent(new Event(DISMISS_EVENT)); }} className="shrink-0 text-current opacity-60 hover:opacity-100"><X size={15} /></button>
      ) : null}
    </div>
  );
}
