"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Pin } from "lucide-react";
import type { FocusCard, ReplyCard, SignalCard, UrgentCard } from "@/lib/data/today";
import { LevelChip } from "@/components/cockpit/why-this-plan";
import { PLAY_SHORT, type PlayCode } from "@/lib/playbook/catalog";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const REPLY_TONE: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-800",
  referral: "bg-emerald-50 text-emerald-800",
  neutral: "bg-sky-50 text-sky-800",
  objection: "bg-amber-50 text-amber-800",
  not_now: "bg-amber-50 text-amber-800",
};

/** Replies always sit on top, but only take space when there is one. */
export function RepliesStrip({ replies }: { replies: ReplyCard[] }) {
  const [all, setAll] = useState(false);
  if (!replies.length) return null;
  const shown = all ? replies : replies.slice(0, 2);
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/60">
      <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wider text-emerald-800">{replies.length} repl{replies.length === 1 ? "y" : "ies"} waiting</div>
      <ul className="divide-y divide-emerald-100">
        {shown.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{r.contact?.full_name ?? r.from_address}</span>
                <span className="text-ink-500">{r.account?.name}</span>
                {r.classification ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", REPLY_TONE[r.classification] ?? "bg-white text-ink-700")}>{r.classification.replace("_", " ")}</span> : null}
                {r.state === "confirmed" ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">Re-plan waiting</span> : null}
              </div>
              {r.summary ? <p className="truncate text-sm text-ink-700">{r.summary}</p> : null}
            </div>
            {r.account ? <Link href={`/accounts/${r.account.id}?reply=${r.id}#responses`}><Button variant="secondary" className="px-3 py-1.5">{r.state === "pending" ? "Confirm" : "Re-plan"}</Button></Link> : null}
          </li>
        ))}
      </ul>
      {replies.length > 2 ? (
        <button onClick={() => setAll((a) => !a)} className="w-full border-t border-emerald-100 px-4 py-2 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-50">
          {all ? "Show fewer" : `Show all ${replies.length}`}
        </button>
      ) : null}
    </section>
  );
}

/** Accounts whose plan was written before new signals arrived. The owner decides whether to re-plan. */
export function SignalsStrip({ cards }: { cards: SignalCard[] }) {
  if (!cards.length) return null;
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-sky-200 bg-sky-50/60" aria-label="New signals">
      <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wider text-sky-800">{cards.length} account{cards.length === 1 ? "" : "s"} with new signals</div>
      <ul className="divide-y divide-sky-100">
        {cards.slice(0, 5).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <LevelChip level={c.level} />
            <div className="min-w-0 flex-1">
              <span className="font-medium">{c.name}</span>
              {c.tier ? <span className="ml-2 rounded bg-white px-1.5 text-[11px] font-semibold text-ink-500">{c.tier}</span> : null}
              <span className="ml-2 text-sm text-ink-500">{c.count} new signal{c.count === 1 ? "" : "s"}{c.latest ? `, latest ${fmtDate(c.latest)}` : ""} · {c.campaignStatus === "draft" ? "draft not launched" : "campaign running"}</span>
            </div>
            <Link href={`/accounts/${c.id}#plan`}><Button variant="secondary" className="px-3 py-1.5">{c.campaignStatus === "draft" ? "Review and regenerate" : "Review and re-plan"}</Button></Link>
          </li>
        ))}
      </ul>
      {cards.length > 5 ? <div className="border-t border-sky-100 px-4 py-2 text-sm text-sky-800">and {cards.length - 5} more on the Accounts page</div> : null}
    </section>
  );
}

/** Super hot and hot accounts waiting for a plan, soonest deadline first. Super hot starts within 24 hours, hot within 48. */
export function UrgentStrip({ urgent, today }: { urgent: UrgentCard[]; today: string }) {
  if (!urgent.length) return null;
  const when = (d: string) => (d < today ? { text: `Overdue since ${fmtDate(d)}`, late: true } : d === today ? { text: "Start today", late: false } : { text: `Start by ${fmtDate(d)}`, late: false });
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-brand-200 bg-brand-50/60" aria-label="Start now">
      <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wider text-brand-700">{urgent.length} account{urgent.length === 1 ? "" : "s"} to start now</div>
      <ul className="divide-y divide-brand-100">
        {urgent.map((u) => {
          const w = when(u.startBy);
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <LevelChip level={u.level} />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{u.name}</span>
                {u.tier ? <span className="ml-2 rounded bg-white px-1.5 text-[11px] font-semibold text-ink-500">{u.tier}</span> : null}
                <span className="ml-2 text-sm text-ink-500">{u.play ? PLAY_SHORT[u.play as PlayCode] : ""} · {u.signals} signal{u.signals === 1 ? "" : "s"}</span>
              </div>
              <span className={w.late ? "text-sm font-semibold text-red-700" : "text-sm font-medium text-ink-700"}>{w.text}</span>
              <Link href={`/accounts/${u.id}`}><Button variant="secondary" className="px-3 py-1.5">Open plan</Button></Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Focus accounts, folded into one row until opened. */
export function FocusStrip({ focus }: { focus: FocusCard[] }) {
  const [open, setOpen] = useState(false);
  const [pins, setPins] = useState<Set<string>>(new Set(focus.filter((f) => f.pinned).map((f) => f.id)));
  if (!focus.length) return null;

  async function togglePin(id: string) {
    const res = await fetch(`/api/accounts/${id}/pin`, { method: "POST" });
    const data = await res.json();
    if (data.ok) setPins((p) => { const n = new Set(p); if (data.pinned) n.add(id); else n.delete(id); return n; });
  }

  return (
    <section className="mb-4 rounded-2xl border border-line bg-white shadow-[var(--shadow-soft)]">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm">
        <span className="font-semibold">Focus accounts</span>
        <span className="min-w-0 flex-1 truncate text-ink-500">{focus.slice(0, 4).map((f) => f.name).join(" · ")}{focus.length > 4 ? ` +${focus.length - 4}` : ""}</span>
        <ChevronDown size={16} className={cn("shrink-0 text-ink-400 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-5">
          {focus.map((f) => (
            <div key={f.id} className="flex flex-col rounded-xl border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/accounts/${f.id}`} className="line-clamp-2 font-medium leading-snug hover:text-brand-700">{f.name}</Link>
                <button onClick={() => togglePin(f.id)} aria-label={pins.has(f.id) ? "Unpin" : "Pin"} className={cn("rounded p-0.5", pins.has(f.id) ? "text-brand-600" : "text-ink-300 hover:text-ink-500")}><Pin size={14} /></button>
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{f.score}</div>
              <div className="mt-1 flex flex-wrap gap-1">{f.reasons.slice(0, 3).map((r) => <span key={r} className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-700">{r}</span>)}</div>
              <Link href={`/accounts/${f.id}`} className="mt-auto pt-2 text-sm font-medium text-brand-700 hover:underline">{f.nextAction}</Link>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
