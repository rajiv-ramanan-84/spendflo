"use client";

import { cn } from "@/lib/cn";

/** What the client receives for an inbox (the server's Inbox, as JSON). */
export type InboxView = {
  key: string;
  mailboxId: string | null;
  email: string;
  writesAs: string | null;
  core: boolean;
  dedicated: boolean;
  connected: boolean;
  paused: boolean;
  pausedReason: string | null;
  warming: boolean;
  warmingDaysLeft: number | null;
  sent: number;
  queued: number;
  max: number;
  warn: number;
  left: number;
  state: "ok" | "warn" | "full";
  isDefault: boolean;
};

export const TONE = {
  ok: { bar: "bg-brand-500", text: "text-ink-700", pill: "bg-emerald-50 text-emerald-700" },
  warn: { bar: "bg-amber-500", text: "text-amber-800", pill: "bg-amber-50 text-amber-800" },
  full: { bar: "bg-rose-500", text: "text-rose-700", pill: "bg-rose-50 text-rose-700" },
} as const;

/**
 * Today's sends against the limit. A tick marks the warning level; a lighter segment is what is still due today.
 * Calm by default: colour only changes once the warning level is passed.
 */
export function Meter({ sent, queued = 0, warn, max, state, className }: { sent: number; queued?: number; warn: number; max: number; state: "ok" | "warn" | "full"; className?: string }) {
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / max) * 100))}%`;
  const queuedPct = Math.min(100 - Math.min(100, (sent / max) * 100), (queued / max) * 100);
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-line", className)} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={sent} aria-label={`${sent} of ${max} sent today`}>
      <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width]", TONE[state].bar)} style={{ width: pct(sent) }} />
      {queuedPct > 0 ? <div className="absolute inset-y-0 bg-brand-200" style={{ left: pct(sent), width: `${queuedPct}%` }} /> : null}
      <div className="absolute inset-y-0 w-px bg-ink-400" style={{ left: pct(warn) }} aria-hidden />
    </div>
  );
}

export function StatePill({ i, hideConnection }: { i: Pick<InboxView, "state" | "paused" | "warming" | "warmingDaysLeft" | "connected">; hideConnection?: boolean }) {
  if (i.paused) return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">Paused</span>;
  if (!i.connected) return hideConnection ? null : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Reconnect needed</span>;
  if (i.state === "full") return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONE.full.pill)}>Limit reached</span>;
  if (i.state === "warn") return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONE.warn.pill)}>Slow down</span>;
  if (i.warming) return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">Warming up{i.warmingDaysLeft ? ` · ${i.warmingDaysLeft} d to full` : ""}</span>;
  return null;
}

/** One inbox: address, meter, numbers. Used in the Today popover and in Settings. */
export function InboxLine({ i, actions }: { i: InboxView; actions?: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 text-sm">
          <span className="font-medium">{i.email}</span>
          {i.writesAs ? <span className="text-ink-500"> · as {i.writesAs}</span> : null}
          {i.core ? <span className="ml-1.5 rounded-full bg-canvas px-1.5 py-0.5 text-[11px] text-ink-500">company domain</span> : null}
        </span>
        <span className="flex items-center gap-2"><StatePill i={i} />{actions}</span>
      </div>
      <Meter sent={i.sent} queued={i.queued} warn={i.warn} max={i.max} state={i.state} />
      <div className={cn("flex justify-between text-xs", TONE[i.state].text)}>
        <span>{i.sent} of {i.max} sent today{i.queued ? ` · ${i.queued} due` : ""}</span>
        <span>{i.left} left</span>
      </div>
    </div>
  );
}
