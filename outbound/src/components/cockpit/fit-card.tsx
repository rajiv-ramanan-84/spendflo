import { Check, CircleHelp, Minus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PLAY_NAME, PLAY_SHORT, type PlayCode } from "@/lib/playbook/catalog";
import { FIT_LABEL, type CheckStatus, type FitCheck, type FitLevel } from "@/lib/playbook/fit";
import { cn } from "@/lib/cn";

const TONE: Record<FitLevel, string> = {
  strong: "bg-emerald-100 text-emerald-800",
  possible: "bg-amber-100 text-amber-800",
  weak: "bg-canvas text-ink-500 ring-1 ring-line",
};

const DOT: Record<FitLevel, string> = { strong: "bg-emerald-500", possible: "bg-amber-400", weak: "bg-ink-400" };
const RANK: Record<FitLevel, number> = { strong: 2, possible: 1, weak: 0 };

/**
 * Fit for the Accounts list. It describes the play being run, so it never contradicts the Play column.
 * When another play fits better, one quiet line says so. With no play yet it shows the best match.
 */
export function FitChip({ run, byPlay, best, overall }: { run: string | null; byPlay: Record<string, string>; best: string | null; overall: string | null }) {
  const shown = (run && byPlay[run] ? run : best) as PlayCode | null;
  const level = ((shown ? byPlay[shown] : null) ?? overall) as FitLevel | null;
  if (!level) return <span className="text-ink-400">–</span>;
  const better = best && best !== shown && RANK[byPlay[best] as FitLevel] > RANK[level] ? (best as PlayCode) : null;
  const hint = !run && shown ? PLAY_SHORT[shown] : better ? `Also fits ${PLAY_SHORT[better]}` : null;
  return (
    <div className="flex flex-col gap-0.5" title={shown ? `${FIT_LABEL[level]} for ${PLAY_NAME[shown]}` : FIT_LABEL[level]}>
      <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-900"><span className={cn("size-2 rounded-full", DOT[level])} />{FIT_LABEL[level].replace(" fit", "")}</span>
      {hint ? <span className="text-[11px] text-ink-400">{hint}</span> : null}
    </div>
  );
}

export interface StoredPlayFit { play: PlayCode; level: FitLevel; score: number; met: number; evaluable: number; unknown: number; checks: FitCheck[] }

const ICON: Record<CheckStatus, { Icon: typeof Check; cls: string; label: string }> = {
  met: { Icon: Check, cls: "text-emerald-600", label: "Met" },
  partial: { Icon: Minus, cls: "text-amber-600", label: "Partly" },
  unmet: { Icon: X, cls: "text-red-600", label: "Not met" },
  unknown: { Icon: CircleHelp, cls: "text-ink-400", label: "To research" },
};

/** Fit against the ICP in the sales playbook, one block per play, with every check shown. */
export function FitCard({ plays, best }: { plays: StoredPlayFit[] | null; best: string | null }) {
  if (!plays?.length) return null;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-900">Fit against the ICP</h3>
        <span className="text-xs text-ink-500">From the sales playbook. This is who is weird not to buy.</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {plays.map((p) => (
          <div key={p.play} className={cn("min-w-0 rounded-lg border p-3", p.play === best ? "border-brand-300 bg-brand-50/40" : "border-line")}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-sm font-semibold text-ink-900">{PLAY_NAME[p.play]}</div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", TONE[p.level])}>{FIT_LABEL[p.level]}</span>
            </div>
            <div className="mt-0.5 text-xs text-ink-500">{p.met} of {p.evaluable} checked criteria met{p.unknown ? ` · ${p.unknown} to research` : ""}{p.play === best ? " · best match" : ""}</div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {p.checks.map((c) => {
                const { Icon, cls, label } = ICON[c.status];
                return (
                  <li key={c.id} className="flex gap-2 text-xs">
                    <Icon size={14} className={cn("mt-0.5 shrink-0", cls)} aria-label={label} />
                    <span className="min-w-0"><span className="text-ink-900">{c.label}</span><span className="block text-ink-500">{c.note}</span></span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
