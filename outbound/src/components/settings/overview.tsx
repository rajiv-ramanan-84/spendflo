import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { needsAttention, type Tile } from "@/lib/settings/health";

const DOT: Record<Tile["tone"], string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-rose-500", off: "bg-ink-300" };

/** Health at a glance: what needs a person first, then everything else. */
export function Overview({ tiles, name }: { tiles: Tile[]; name: string }) {
  const attn = needsAttention(tiles);
  const fine = tiles.filter((t) => !attn.includes(t));
  return (
    <div className="grid gap-5">
      {attn.length ? (
        <Card className="overflow-hidden border-amber-200">
          <div className="border-b border-amber-100 bg-amber-50/60 px-5 py-3"><h2 className="text-[15px] font-semibold">{attn.length} thing{attn.length === 1 ? "" : "s"} need{attn.length === 1 ? "s" : ""} you, {name.split(" ")[0]}</h2></div>
          <ul className="divide-y divide-line">
            {attn.map((t) => (
              <li key={t.id}>
                <Link href={t.href} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-canvas/60">
                  <span className="flex min-w-0 items-start gap-3">
                    <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[t.tone])} aria-hidden />
                    <span className="min-w-0"><span className="block text-sm font-medium">{t.label}: {t.value}</span>{t.detail ? <span className="block text-sm text-ink-500">{t.detail}</span> : null}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700">{t.cta ?? "Open"} <ArrowRight size={14} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="flex items-center gap-3 border-emerald-200 bg-emerald-50/50 p-5"><span className="grid size-8 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={16} /></span><div><h2 className="text-[15px] font-semibold">Everything is running</h2><p className="text-sm text-ink-500">Nothing needs you right now.</p></div></Card>
      )}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink-700">All systems</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...attn, ...fine].map((t) => (
            <Link key={t.id} href={t.href} className="group rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-soft)] transition-colors hover:border-brand-200">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-ink-500">{t.label}</span><span className={cn("size-2.5 rounded-full", DOT[t.tone])} aria-label={t.tone} /></div>
              <div className="mt-1.5 text-[15px] font-semibold leading-snug">{t.value}</div>
              {t.detail ? <p className="mt-1 line-clamp-2 text-xs text-ink-500">{t.detail}</p> : null}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
