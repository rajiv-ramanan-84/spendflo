"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";

type Row = { id: string; sheet_tab: string; sheet_row: number | null; sheet_key: string | null; details: string | null };
type Group = { type: string; label: string; fix: string; rows: Row[] };
type Props = {
  lastRun: { status: string; at: string; error: string | null } | null;
  lastOkAt: string | null;
  total: number;
  groups: Group[];
  sheetUrl: string | null;
  canEdit: boolean;
};

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
const tabName = (t: string) => (t === "master" ? "Master" : "Contacts");

export function DataSettings(p: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(p.groups[0]?.type ?? null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function ignore(id: string) {
    setError(null);
    const res = await fetch(`/api/settings/data-quality/${id}`, { method: "POST" });
    const data = await res.json().catch(() => ({ ok: false, error: "No response" }));
    if (!data.ok) return setError(data.error);
    setHidden((h) => [...h, id]);
    router.refresh();
  }

  const visible = p.groups.map((g) => ({ ...g, rows: g.rows.filter((r) => !hidden.includes(r.id)) })).filter((g) => g.rows.length);
  const remaining = visible.reduce((n, g) => n + g.rows.length, 0);

  return (
    <Card id="data" className="scroll-mt-24 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold">Data: sheet sync</h2>
          <p className="mt-1 text-sm text-ink-500">
            The Coupa account book syncs every hour. Rows the app could not use are listed below with how to fix them. Fix them in the sheet; they clear on the next sync.
          </p>
        </div>
        {p.sheetUrl ? (
          <a href={p.sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium hover:border-brand-200 hover:bg-brand-50">
            Open the sheet <ExternalLink size={14} />
          </a>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div><span className="text-ink-400">Last sync </span>{p.lastRun ? <span className={p.lastRun.status === "failed" ? "font-medium text-rose-700" : "font-medium"}>{when(p.lastRun.at)}{p.lastRun.status === "failed" ? " (failed)" : ""}</span> : "never"}</div>
        {p.lastRun?.status === "failed" && p.lastOkAt ? <div><span className="text-ink-400">Last good sync </span><span className="font-medium">{when(p.lastOkAt)}</span></div> : null}
        <div><span className="text-ink-400">Rows to check </span><span className="font-semibold tabular-nums">{remaining}</span></div>
      </div>
      {p.lastRun?.status === "failed" && p.lastRun.error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{p.lastRun.error}</p> : null}
      {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">Nothing to check. Every row in the sheet was imported.</p>
      ) : (
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {visible.map((g) => (
            <div key={g.type}>
              <button onClick={() => setOpen(open === g.type ? null : g.type)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas/60">
                <span className="text-sm font-medium">{g.label} <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{g.rows.length}</span></span>
                <ChevronDown size={16} className={`text-ink-400 transition-transform ${open === g.type ? "rotate-180" : ""}`} />
              </button>
              {open === g.type ? (
                <div className="px-4 pb-4">
                  {g.fix ? <p className="mb-3 rounded-xl bg-canvas px-3 py-2 text-sm text-ink-700"><span className="font-medium">How to fix: </span>{g.fix}</p> : null}
                  <ul className="grid gap-1.5">
                    {g.rows.map((r) => (
                      <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-canvas/60">
                        <span className="min-w-0">
                          <span className="font-medium">{r.sheet_key || "(no name)"}</span>
                          <span className="text-ink-400"> · {tabName(r.sheet_tab)}{r.sheet_row ? ` row ${r.sheet_row}` : ""}</span>
                          {r.details ? <span className="block text-ink-500">{r.details}</span> : null}
                        </span>
                        {p.canEdit ? <button onClick={() => ignore(r.id)} className="rounded-lg px-2 py-1 text-xs font-medium text-ink-500 hover:bg-white hover:text-ink-900">Ignore</button> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
