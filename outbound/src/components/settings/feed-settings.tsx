import { Radio } from "lucide-react";
import { Card } from "@/components/ui/card";

type Props = {
  configured: boolean;
  runs: Array<{ at: string; read: number; accepted: number; duplicates: number; rejected: number; held: number; accounts: number; error: string | null }>;
  week: { accepted: number; duplicate: number; rejected: number; deferred: number; acceptedRate: number | null };
  topReasons: Array<{ reason: string; count: number }>;
};

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The vendor feed at a glance: how the last runs went and the weekly scorecard the pilot is judged on. */
export function FeedSettings(p: Props) {
  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2"><Radio size={18} className="text-brand-500" /><h2 className="text-lg font-semibold">Vendor signals</h2></div>
      {!p.configured ? (
        <p className="mt-2 text-sm text-ink-500">Not connected. Add GOOGLE_SIGNALS_SHEET_ID in Vercel and share the feed sheet with the service account to turn it on.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {[["Accepted this week", p.week.accepted], ["Rejected", p.week.rejected], ["Duplicates", p.week.duplicate], ["Held for a limit", p.week.deferred]].map(([label, n]) => (
              <div key={label as string} className="rounded-xl border border-line p-3"><div className="text-2xl font-semibold tabular-nums">{n}</div><div className="text-xs text-ink-500">{label}</div></div>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-700">{p.week.acceptedRate === null ? "No rows decided in the last 7 days." : <>Accepted rate <b>{p.week.acceptedRate}%</b> of decided rows. The pilot target is 90%.</>}</p>
          {p.topReasons.length ? (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Most common reasons for rejection</div>
              <ul className="mt-1 flex flex-col gap-1 text-sm">{p.topReasons.map((r) => <li key={r.reason} className="flex gap-2"><span className="w-8 shrink-0 text-right tabular-nums text-ink-500">{r.count}</span><span className="min-w-0 text-ink-700">{r.reason}</span></li>)}</ul>
            </div>
          ) : null}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-400"><th className="py-1.5 pr-3">Run</th><th className="px-2">Rows</th><th className="px-2">Accepted</th><th className="px-2">Rejected</th><th className="px-2">Duplicate</th><th className="px-2">Held</th><th className="px-2">Accounts</th></tr></thead>
              <tbody>
                {p.runs.length ? p.runs.map((r) => (
                  <tr key={r.at} className="border-t border-line">
                    <td className="py-1.5 pr-3 text-ink-700">{when(r.at)}{r.error ? <span className="ml-2 text-xs text-brand-700">{r.error}</span> : null}</td>
                    <td className="px-2 tabular-nums">{r.read}</td><td className="px-2 tabular-nums">{r.accepted}</td><td className="px-2 tabular-nums">{r.rejected}</td><td className="px-2 tabular-nums">{r.duplicates}</td><td className="px-2 tabular-nums">{r.held}</td><td className="px-2 tabular-nums">{r.accounts}</td>
                  </tr>
                )) : <tr><td colSpan={7} className="py-3 text-ink-500">No runs yet. The first one happens at the next sync.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
