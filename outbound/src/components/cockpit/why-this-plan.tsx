import { ExternalLink } from "lucide-react";
import type { PlayResult } from "@/lib/playbook/gate";
import { LEVEL_LABEL } from "@/lib/playbook/gate";
import { PLAY_NAME, PLAY_SHORT, PLAY_CODES } from "@/lib/playbook/catalog";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const LEVEL_TONE: Record<string, string> = {
  hot: "bg-brand-100 text-brand-700",
  warm: "bg-amber-100 text-amber-800",
  nurture: "bg-sky-100 text-sky-800",
  not_fit: "bg-canvas text-ink-500 ring-1 ring-line",
};

/** The level chip used on the Accounts list and here. */
export function LevelChip({ level }: { level: string | null }) {
  if (!level) return null;
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", LEVEL_TONE[level] ?? LEVEL_TONE.nurture)}>{LEVEL_LABEL[level as keyof typeof LEVEL_LABEL] ?? level}</span>;
}

function ago(days: number | null) {
  if (days === null) return "no date";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return days < 60 ? `${days} days ago` : `${Math.round(days / 30)} months ago`;
}

/**
 * Why this plan: the play and level the account earned, and each signal with its date.
 * The long reasoning Claude wrote sits behind a click on the draft; this is the
 * part a person can check in ten seconds.
 */
export function WhyThisPlan({ result, draftPlay }: { result: PlayResult; draftPlay?: string | null }) {
  const code = result.play ?? result.pointsTo;
  const rows = [
    ...result.fresh.map((s) => ({ s, state: "counts" as const })),
    ...result.stale.map((s) => ({ s, state: "history" as const })),
    ...result.facts.map((s) => ({ s, state: "fact" as const })),
    ...result.ignored.map((s) => ({ s, state: "ignored" as const })),
  ];
  const mismatch = !!draftPlay && !!result.play && draftPlay !== result.play;
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-soft)]" aria-label="Why this plan">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Why this plan</div>
        <LevelChip level={result.level} />
        {code ? <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold text-ink-700 ring-1 ring-line">{PLAY_NAME[code]}</span> : null}
        {result.lastSignalOn ? <span className="text-xs text-ink-400">Newest signal {fmtDate(result.lastSignalOn)}</span> : null}
      </div>
      <ul className="mt-2 flex flex-col gap-0.5 text-sm text-ink-700">
        {result.reasons.map((r) => <li key={r}>{r}</li>)}
        {result.level === "nurture" ? <li className="text-ink-500">No sequence is drafted until a signal lands. You can still draft one.</li> : null}
        {mismatch ? <li className="text-amber-800">The draft leads with a different play than the signals point to.</li> : null}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" aria-label="Plays considered">
        <span className="text-ink-400">Plays considered</span>
        {PLAY_CODES.map((c) => {
          const n = result.counts[c].distinct;
          const lead = result.play === c;
          const factOnly = n === 0 && result.facts.some((f) => f.plays.includes(c));
          return (
            <span key={c} className={cn("rounded-full px-2.5 py-1 font-medium ring-1", lead ? "bg-brand-50 text-brand-700 ring-brand-200" : n ? "bg-white text-ink-700 ring-line" : "bg-canvas text-ink-400 ring-line")}>
              {PLAY_SHORT[c]} · {n ? `${n} signal${n === 1 ? "" : "s"}` : factOnly ? "fit fact only" : "none"}{lead ? " · leading" : ""}
            </span>
          );
        })}
      </div>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="bg-canvas text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400"><th className="px-3 py-2">Signal</th><th className="px-3 py-2">Seen</th><th className="px-3 py-2">Evidence</th><th className="px-3 py-2">Counts</th></tr></thead>
            <tbody>
              {rows.map(({ s, state }) => (
                <tr key={`${s.id}-${s.raw}`} className={cn("border-t border-line align-top", state !== "counts" && "text-ink-400")}>
                  <td className="whitespace-nowrap px-3 py-2"><span className="font-mono text-xs font-semibold">{s.id}</span> <span className="text-ink-600">{s.name}</span>{s.kind === "Direct" ? <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 text-[10px] font-semibold text-brand-700">Direct</span> : null}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{s.seenOn ? <>{fmtDate(s.seenOn)}<div className="text-xs text-ink-400">{ago(s.ageDays)}</div></> : "Undated"}</td>
                  <td className="px-3 py-2"><span className="line-clamp-2">{s.evidence || "No detail"}</span>{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">Source<ExternalLink size={11} /></a> : null}{s.confidence === "likely" ? <span className="ml-2 text-xs text-ink-400">Likely</span> : null}</td>
                  <td className="whitespace-nowrap px-3 py-2">{state === "counts" ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Counts</span> : state === "history" ? <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink-500 ring-1 ring-line">History</span> : state === "fact" ? <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink-500 ring-1 ring-line">Fit fact</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{s.expired ? "Expired" : s.ageDays === null ? "Undated" : "Not on the list"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-3 rounded-xl bg-canvas px-3 py-2.5 text-sm text-ink-500">No signals on this row yet. The agency adds one line per signal in the Signals cell: ID | date | evidence | link | confidence.</p>}
    </section>
  );
}
