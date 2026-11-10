"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import type { AccountRow, UserLite } from "@/lib/data/queries";
import { CAMPAIGN_STATUS_LABEL, fmtDate, firstName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LevelChip } from "@/components/cockpit/why-this-plan";
import { LaunchDialog } from "@/components/accounts/launch-dialog";
import { FitChip } from "@/components/cockpit/fit-card";
import { PLAY_SHORT, type PlayCode } from "@/lib/playbook/catalog";

type Filter = "all" | "mine" | "unassigned" | "not_started" | "draft" | "live" | "replied" | "archived";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "mine", label: "Mine" },
  { id: "all", label: "All active" },
  { id: "not_started", label: "Not started" },
  { id: "draft", label: "Draft ready" },
  { id: "live", label: "Live" },
  { id: "replied", label: "Replied" },
  { id: "unassigned", label: "Unassigned" },
  { id: "archived", label: "Archived" },
];

const LIVE = new Set(["active", "paused", "responded", "meeting_booked"]);

function statusChip(s: string | null) {
  if (!s) return <span className="text-ink-400">Not started</span>;
  const label = s ? (CAMPAIGN_STATUS_LABEL[s] ?? s) : "Not started";
  const tone =
    s === "draft" ? "bg-brand-50 text-brand-700"
    : s === "active" ? "bg-sky-50 text-sky-800"
    : s === "responded" ? "bg-emerald-50 text-emerald-800"
    : s === "meeting_booked" ? "bg-emerald-100 text-emerald-900"
    : "bg-canvas text-ink-500 border border-line";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tone)}>{label}</span>;
}

export function AccountsTable({ accounts, users, me, canAssign }: { accounts: AccountRow[]; users: UserLite[]; me: string | null; canAssign: boolean }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(me && accounts.some((a) => a.owner_id === me) ? "mine" : "all");
  const [tier, setTier] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [fit, setFit] = useState<string>("all");
  const [more, setMore] = useState(false);
  const [play, setPlay] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  const userIndex = useMemo(() => new Map(users.map((u, i) => [u.id, { u, i }])), [users]);

  const counts = useMemo(() => {
    const active = accounts.filter((a) => !a.archived);
    return {
      mine: active.filter((a) => a.owner_id === me).length,
      all: active.length,
      not_started: active.filter((a) => !a.campaign_status).length,
      draft: active.filter((a) => a.campaign_status === "draft").length,
      live: active.filter((a) => a.campaign_status && LIVE.has(a.campaign_status)).length,
      replied: active.filter((a) => a.campaign_status === "responded" || a.campaign_status === "meeting_booked").length,
      unassigned: active.filter((a) => !a.owner_id).length,
      archived: accounts.length - active.length,
    } satisfies Record<Filter, number>;
  }, [accounts, me]);

  const extra = [tier, fit, play, owner].filter((v) => v !== "all").length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (filter === "archived" ? !a.archived : a.archived) return false;
      if (filter === "mine" && a.owner_id !== me) return false;
      if (filter === "unassigned" && a.owner_id) return false;
      if (filter === "not_started" && a.campaign_status) return false;
      if (filter === "draft" && a.campaign_status !== "draft") return false;
      if (filter === "live" && !(a.campaign_status && LIVE.has(a.campaign_status))) return false;
      if (filter === "replied" && !(a.campaign_status === "responded" || a.campaign_status === "meeting_booked")) return false;
      if (tier !== "all" && a.tier !== tier) return false;
      if (owner !== "all" && a.owner_id !== owner) return false;
      if (level !== "all" && a.play_level !== level) return false;
      if (fit !== "all" && (a.fit_by_play[a.play ?? a.play_points_to ?? ""] ?? a.fit_level) !== fit) return false;
      if (play !== "all" && (a.play ?? a.play_points_to) !== play) return false;
      if (q && !`${a.name} ${a.domain ?? ""} ${a.sheet_account_id}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [accounts, filter, tier, owner, level, fit, play, query, me]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function assign() {
    if (!assignTo || !selected.size) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/accounts/assign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountIds: [...selected], ownerId: assignTo }) });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) return setMessage(data.error);
    setMessage(`Assigned ${data.assigned} account${data.assigned === 1 ? "" : "s"} to ${userIndex.get(assignTo)?.u.name}.`);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.id ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-canvas hover:text-ink-900",
            )}
          >
            {f.label} <span className={cn("ml-1 tabular-nums", filter === f.id ? "text-white/70" : "text-ink-400")}>{counts[f.id]}</span>
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level" className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm">
            <option value="all">All levels</option>
            <option value="super_hot">Super hot</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="nurture">Nurture</option>
          </select>
          <button onClick={() => setMore((m) => !m)} aria-expanded={more} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors", more || extra ? "border-ink-900 text-ink-900" : "border-line text-ink-700 hover:bg-canvas")}>
            <SlidersHorizontal size={14} />Filters{extra ? <span className="rounded-full bg-ink-900 px-1.5 text-[11px] font-semibold text-white">{extra}</span> : null}
          </button>
          <label className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
            <Search size={14} className="text-ink-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search accounts" className="w-36 bg-transparent text-sm outline-none" />
          </label>
        </div>
      </div>

      {more ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas/50 px-4 py-2.5">
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm">
            <option value="all">All tiers</option>
            {["A", "B", "C", "D"].map((t) => <option key={t} value={t}>Tier {t}</option>)}
          </select>
          <select value={fit} onChange={(e) => setFit(e.target.value)} aria-label="Fit" className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm">
            <option value="all">All fit</option>
            <option value="strong">Strong fit</option>
            <option value="possible">Possible fit</option>
            <option value="weak">Weak fit</option>
          </select>
          <select value={play} onChange={(e) => setPlay(e.target.value)} aria-label="Play" className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm">
            <option value="all">All plays</option>
            {(["A1", "A2", "A3"] as const).map((c) => <option key={c} value={c}>{PLAY_SHORT[c]}</option>)}
          </select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm">
            <option value="all">Any owner</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {extra ? <button className="text-sm text-ink-500 hover:text-ink-900" onClick={() => { setTier("all"); setFit("all"); setPlay("all"); setOwner("all"); }}>Clear</button> : null}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-brand-50 px-4 py-2.5 text-sm">
          <span className="font-medium text-brand-700">{selected.size} selected</span>
          <Button className="px-3 py-1.5" onClick={() => setLaunching(true)}>Launch campaigns</Button>
          {canAssign ? (
            <>
              <span className="text-ink-300">|</span>
              <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-sm">
                <option value="">Assign to…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <Button variant="secondary" className="px-3 py-1.5" onClick={assign} disabled={!assignTo || busy}>{busy ? "Assigning…" : "Assign"}</Button>
            </>
          ) : null}
          <button className="text-ink-500 hover:text-ink-900" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      ) : null}
      {message ? <div className="border-b border-line px-4 py-2 text-sm text-ink-700">{message}</div> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-400">
              {true ? (
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
                </th>
              ) : null}
              <th className="px-4 py-3">Account</th>
              <th className="px-2 py-3">Tier</th>
              <th className="px-2 py-3">Fit</th>
              <th className="px-2 py-3">Play</th>
              <th className="px-2 py-3">Owner</th>
              <th className="px-2 py-3">Engaged</th>
              <th className="px-2 py-3">Campaign</th>
              <th className="px-2 py-3">Next step</th>
              <th className="px-4 py-3">Last touch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const o = a.owner_id ? userIndex.get(a.owner_id) : undefined;
              return (
                <tr key={a.id} className="border-t border-line hover:bg-canvas/60">
                  {true ? (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${a.name}`}
                        checked={selected.has(a.id)}
                        onChange={(e) => {
                          const n = new Set(selected);
                          if (e.target.checked) n.add(a.id); else n.delete(a.id);
                          setSelected(n);
                        }}
                      />
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <Link href={`/accounts/${a.id}`} className="font-medium text-ink-900 hover:text-brand-700">{a.name}</Link>
                    <div className="text-xs text-ink-400">{a.domain ?? a.sheet_account_id}</div>
                  </td>
                  <td className="px-2 py-3"><span className="rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-700">{a.tier ?? "–"}</span></td>
                  <td className="px-2 py-3"><FitChip run={a.play ?? a.play_points_to} byPlay={a.fit_by_play} best={a.fit_best_play} overall={a.fit_level} /></td>
                  <td className="px-2 py-3">
                    {a.play_level ? (
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="inline-flex items-center gap-1.5">{a.play_level === "nurture" ? <span className="text-[13px] text-ink-500">Nurture</span> : <LevelChip level={a.play_level} />}<span className="text-xs text-ink-700">{(a.play ?? a.play_points_to) ? PLAY_SHORT[(a.play ?? a.play_points_to) as PlayCode] : ""}</span></span>
                        <span className={cn("text-[11px]", a.start_by && a.start_by < todayIso ? "font-semibold text-red-700" : "text-ink-400")}>{a.start_by ? (a.start_by < todayIso ? `Overdue ${fmtDate(a.start_by)}` : a.start_by === todayIso ? "Start today" : `Start by ${fmtDate(a.start_by)}`) : a.play_level === "nurture" ? `${a.play_cooling ? "Cooling · " : ""}${a.last_signal_on ? `last signal ${fmtDate(a.last_signal_on)}` : ""}` : a.play_level === "not_fit" ? "" : `${a.play_signal_count} signal${a.play_signal_count === 1 ? "" : "s"}`}</span>
                      </div>
                    ) : <span className="text-ink-400">–</span>}
                  </td>
                  <td className="px-2 py-3">
                    {o ? (
                      <span className="inline-flex items-center gap-2"><Avatar name={o.u.name} index={o.i} size={22} />{firstName(o.u.name)}</span>
                    ) : <span className="text-ink-400">Unassigned</span>}
                    {a.sheet_owner_hint ? <div className="text-xs text-ink-400">Sheet says {a.sheet_owner_hint}</div> : null}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-ink-700">{a.contacts_total ? `${a.contacts_engaged} of ${a.contacts_total}` : "No contacts"}</td>
                  <td className="px-2 py-3">{statusChip(a.campaign_status)}</td>
                  <td className="px-2 py-3 text-ink-700">{fmtDate(a.next_step_date) || <span className="text-ink-400">–</span>}</td>
                  <td className="px-4 py-3 text-ink-500">{fmtDate(a.last_touch) || "–"}</td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-500">No accounts match these filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {launching ? <LaunchDialog accountIds={[...selected]} onClose={() => setLaunching(false)} onLaunched={() => { setSelected(new Set()); router.refresh(); }} /> : null}
    </div>
  );
}
