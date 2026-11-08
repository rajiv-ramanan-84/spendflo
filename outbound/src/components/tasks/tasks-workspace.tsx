"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Lock, Search, SlidersHorizontal, X } from "lucide-react";
import type { TodayStep } from "@/lib/data/today";
import type { UserLite } from "@/lib/data/queries";
import { ChannelIcon } from "@/components/ui/channel";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/page-header";
import { UndoToast, type UndoState } from "@/components/today/undo-toast";
import { TaskPanel } from "./task-panel";
import { CHANNEL_LABEL, fmtDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  CHANNEL_TABS, EMPTY_FILTERS, STATE_LABEL, VIEWS, channelTab, groupKey, inView, passes, sortTasks, toQuery,
  type ChannelTab, type Filters, type Sort, type View,
} from "@/lib/tasks/view";

type Batch = { ids: string[]; done: number };

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json().catch(() => ({ ok: false, error: "No response" }));
}

export function TasksWorkspace(props: {
  tasks: TodayStep[];
  users: UserLite[];
  me: string | null;
  today: string;
  doneToday: number;
  scope: "mine" | "team";
  initial: { view: View; ch: ChannelTab; sort: Sort; f: Filters };
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TodayStep[]>(props.tasks);
  const [view, setView] = useState<View>(props.initial.view);
  const [ch, setCh] = useState<ChannelTab>(props.initial.ch);
  const [sort, setSort] = useState<Sort>(props.initial.sort);
  const [f, setF] = useState<Filters>(props.initial.f);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [doneNow, setDoneNow] = useState<string[]>([]);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [popOpen, setPopOpen] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // A refresh from the server replaces the local list.
  const [seen, setSeen] = useState(props.tasks);
  if (seen !== props.tasks) {
    setSeen(props.tasks);
    setTasks(props.tasks);
  }

  // Filters live in the link, so "Overdue, Sid, LinkedIn" can be bookmarked or shared.
  useEffect(() => {
    const q = toQuery({ view, ch, sort, f, scope: props.scope });
    window.history.replaceState(null, "", `${window.location.pathname}${q}`);
  }, [view, ch, sort, f, props.scope]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!popOpen) return;
    const close = (e: MouseEvent) => { if (!popRef.current?.contains(e.target as Node)) setPopOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [popOpen]);

  const userById = useMemo(() => new Map(props.users.map((u) => [u.id, u])), [props.users]);
  const senderOf = useCallback((id: string | null) => {
    const u = id ? userById.get(id) : undefined;
    return u?.sendsAs?.name ?? u?.name ?? "Unassigned";
  }, [userById]);

  const base = useMemo(() => tasks.filter((t) => passes(t, f, senderOf)), [tasks, f, senderOf]);
  const inThisView = useMemo(() => base.filter((t) => inView(t, view)), [base, view]);
  const rows = useMemo(() => sortTasks(inThisView.filter((t) => ch === "all" || channelTab(t.channel) === ch), sort), [inThisView, ch, sort]);
  const order = batch ? batch.ids.filter((id) => tasks.some((t) => t.id === id)) : rows.map((t) => t.id);
  const open = tasks.find((t) => t.id === openId) ?? null;

  const senders = useMemo(() => [...new Set(tasks.map((t) => senderOf(t.assignee_id)))].sort(), [tasks, senderOf]);
  const accounts = useMemo(() => [...new Map(tasks.map((t) => [t.account.id, t.account.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [tasks]);
  const tiers = useMemo(() => [...new Set(tasks.map((t) => t.account.tier).filter(Boolean))].sort() as string[], [tasks]);
  const setCount = (["from", "state", "tier", "account"] as const).filter((k) => f[k]).length;

  const openTasks = tasks.filter((t) => t.state !== "waiting" && (t.bucket === "today" || t.bucket === "overdue")).length;
  const doneTotal = props.doneToday + doneNow.length;
  const dayTotal = doneTotal + openTasks;

  const move = useCallback((dir: number) => {
    if (!order.length) return;
    const i = openId ? order.indexOf(openId) : -1;
    setOpenId(order[i < 0 ? 0 : Math.max(0, Math.min(order.length - 1, i + dir))]);
  }, [order, openId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "j") move(1);
      else if (e.key === "k") move(-1);
      else if (e.key === "Escape") { setOpenId(null); setBatch(null); }
      else if (e.key === "x" && openId) toggle(openId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggle(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.state === "waiting") return;
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  /** A step left the list (sent, skipped, logged): move to the next one, batch or not. */
  function finished(id: string, label: string) {
    const t = tasks.find((x) => x.id === id);
    const i = order.indexOf(id);
    const rest = order.filter((x) => x !== id);
    setTasks((ts) => ts.filter((x) => x.id !== id));
    setSel((s) => { const n = new Set(s); n.delete(id); return n; });
    if (label !== "Snoozed") setDoneNow((d) => [...d, id]);
    setUndo({ stepId: id, label: `${t?.contact.full_name ?? "Step"}: ${label}`, at: Date.now() });
    if (batch) {
      const left = batch.ids.filter((x) => x !== id && tasks.some((tt) => tt.id === x));
      if (!left.length) { setToast(`Batch done. ${batch.ids.length} of ${batch.ids.length} finished.`); setBatch(null); setOpenId(null); return; }
      setBatch({ ...batch, done: batch.done + 1 });
      setOpenId(left[Math.min(Math.max(i, 0), left.length - 1)]);
      return;
    }
    setOpenId(rest.length ? rest[Math.min(Math.max(i, 0), rest.length - 1)] : null);
  }

  function snoozed(id: string, date: string) {
    const t = tasks.find((x) => x.id === id);
    finished(id, "Snoozed");
    setUndo({ stepId: id, label: `${t?.contact.full_name ?? "Step"} snoozed to ${fmtDate(date)}`, at: Date.now() });
    router.refresh();
  }

  async function doUndo() {
    if (!undo) return;
    const d = await post(`/api/steps/${undo.stepId}/undo`);
    setUndo(null);
    if (!d.ok) return setToast(d.error);
    setDoneNow((x) => x.filter((id) => id !== undo.stepId));
    router.refresh();
  }

  async function pull(ids: string[]) {
    setWorking("Moving to today...");
    const moved: string[] = [];
    const kept: string[] = [];
    for (const id of ids) {
      const d = await post(`/api/steps/${id}/pull`);
      const t = tasks.find((x) => x.id === id);
      if (d.ok) moved.push(id); else kept.push(`${t?.contact.full_name}: ${d.error}`);
    }
    setTasks((ts) => ts.map((t) => (moved.includes(t.id) ? { ...t, due_date: props.today, bucket: "today" } : t)));
    setSel(new Set());
    setWorking(null);
    setToast(`${moved.length} moved to today.${kept.length ? ` Kept where they were: ${kept.join("; ")}` : ""}`);
    if (moved.length) router.refresh();
  }

  async function drafts(ids: string[]) {
    const emails = ids.filter((id) => tasks.find((t) => t.id === id)?.channel === "email");
    setWorking(`Creating ${emails.length} Gmail drafts...`);
    let ok = 0;
    const failed: string[] = [];
    for (const id of emails) {
      const d = await post(`/api/steps/${id}/gmail-draft`);
      const t = tasks.find((x) => x.id === id);
      if (d.ok) ok++; else failed.push(`${t?.contact.full_name}: ${d.error}`);
    }
    setWorking(null);
    setToast(`${ok} draft${ok === 1 ? "" : "s"} ready in Gmail. Send them there and each one marks itself done within 15 minutes.${failed.length ? ` Needs attention: ${failed.join("; ")}` : ""}`);
  }

  async function snoozeMany(ids: string[]) {
    setWorking("Snoozing...");
    for (const id of ids) await post(`/api/steps/${id}/snooze`, { days: 1 });
    setWorking(null);
    setSel(new Set());
    setToast(`${ids.length} snoozed by 1 working day.`);
    router.refresh();
  }

  function startBatch(ids: string[]) {
    const ordered = rows.map((t) => t.id).filter((id) => ids.includes(id));
    if (!ordered.length) return;
    setBatch({ ids: ordered, done: 0 });
    setSel(new Set());
    setOpenId(ordered[0]);
  }

  const selected = [...sel].filter((id) => tasks.some((t) => t.id === id));
  const selectable = rows.filter((t) => t.state !== "waiting");
  const allOn = selectable.length > 0 && selectable.every((t) => sel.has(t.id));
  const selFuture = selected.filter((id) => { const t = tasks.find((x) => x.id === id); return t && (t.bucket === "tomorrow" || t.bucket === "week" || t.bucket === "later"); });
  const selEmails = selected.filter((id) => tasks.find((t) => t.id === id)?.channel === "email");

  const tokens: Array<{ key: keyof Filters; label: string }> = [
    f.from ? { key: "from" as const, label: `From: ${f.from}` } : null,
    f.state ? { key: "state" as const, label: `Status: ${STATE_LABEL[f.state as keyof typeof STATE_LABEL] ?? f.state}` } : null,
    f.tier ? { key: "tier" as const, label: `Tier ${f.tier}` } : null,
    f.account ? { key: "account" as const, label: accounts.find(([id]) => id === f.account)?.[1] ?? "Account" } : null,
  ].filter(Boolean) as Array<{ key: keyof Filters; label: string }>;

  let lastGroup = "";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-white/70 p-1 shadow-[var(--shadow-soft)]" role="tablist" aria-label="Which tasks">
          {VIEWS.map((v) => {
            const n = base.filter((t) => inView(t, v.id)).length;
            return (
              <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => { setView(v.id); setSel(new Set()); setBatch(null); }}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium", view === v.id ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900")}>
                {v.label}
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", v.id === "overdue" && n ? "bg-amber-50 text-amber-700" : view === v.id ? "bg-brand-50 text-brand-700" : "bg-canvas text-ink-500")}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-sm text-ink-500">
          <span className="tabular-nums">{doneTotal} of {dayTotal} done today</span>
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: dayTotal ? `${(doneTotal / dayTotal) * 100}%` : "0%" }} /></span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5 text-sm sm:max-w-64">
          <Search size={15} className="text-ink-400" />
          <input id="task-search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search people or accounts" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <div className="relative" ref={popRef}>
          <button onClick={() => setPopOpen((o) => !o)} aria-expanded={popOpen} className={cn("inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-1.5 text-sm font-medium", setCount ? "border-brand-200 text-brand-700" : "border-line text-ink-700")}>
            <SlidersHorizontal size={15} />Filters{setCount ? <span className="rounded-full bg-brand-50 px-1.5 text-[11px] font-semibold">{setCount}</span> : null}
          </button>
          {popOpen ? (
            <div className="absolute left-0 top-full z-30 mt-1.5 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-1.5 rounded-2xl border border-line bg-white p-2.5 shadow-[var(--shadow-lift)]">
              <Select id="f-from" label="From" value={f.from} onChange={(v) => setF({ ...f, from: v })} options={[["", "Everyone"], ...senders.map((s) => [s, s] as [string, string])]} />
              <Select id="f-state" label="Status" value={f.state} onChange={(v) => setF({ ...f, state: v })} options={[["", "Any"], ["ready", "Ready"], ["edit", "Needs edit"], ["waiting", "Waiting"]]} />
              <Select id="f-tier" label="Tier" value={f.tier} onChange={(v) => setF({ ...f, tier: v })} options={[["", "All tiers"], ...tiers.map((t) => [t, `Tier ${t}`] as [string, string])]} />
              <Select id="f-account" label="Account" value={f.account} onChange={(v) => setF({ ...f, account: v })} options={[["", "All accounts"], ...accounts]} />
              {setCount ? <button onClick={() => setF({ ...EMPTY_FILTERS, q: f.q })} className="mt-1 py-1 text-sm font-medium text-brand-700">Clear all</button> : null}
            </div>
          ) : null}
        </div>
        {tokens.map((t) => (
          <button key={t.key} onClick={() => setF({ ...f, [t.key]: "" })} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-700">
            {t.label}<span className="grid h-4 w-4 place-items-center rounded-full bg-white"><X size={10} /></span>
          </button>
        ))}
      </div>

      <div className={cn("grid items-start gap-4", open ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]" : "grid-cols-[minmax(0,1fr)]")}>
        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2">
              {CHANNEL_TABS.map((c) => {
                const n = c.id === "all" ? inThisView.length : inThisView.filter((t) => channelTab(t.channel) === c.id).length;
                return (
                  <button key={c.id} onClick={() => setCh(c.id)} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 pb-2 pt-2.5 text-sm font-medium", ch === c.id ? "border-brand-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900")}>
                    {c.id === "all" ? null : <ChannelIcon channel={c.id === "connect" ? "linkedin_connect" : c.id === "message" ? "linkedin_message" : c.id} size={14} />}
                    {c.label}<span className="text-xs tabular-nums text-ink-400">{n}</span>
                  </button>
                );
              })}
              <label className="ml-auto flex items-center gap-1 whitespace-nowrap pl-2 text-xs text-ink-400">
                Sort
                <select id="task-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-transparent font-medium text-ink-700 outline-none">
                  <option value="due">Due date</option>
                  <option value="account">Account</option>
                </select>
              </label>
            </div>

            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                      <th className="w-10 py-2 pl-4"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(selectable.map((t) => t.id)))} className="h-4 w-4 accent-[var(--color-brand-500)]" /></th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Account</th>
                      <th className="py-2 pr-3">Step</th>
                      {!open ? <th className="py-2 pr-3">From</th> : null}
                      <th className="py-2 pr-3">Status</th>
                      {!open ? <th className="py-2 pr-4" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const g = groupKey(t, sort, props.today);
                      const header = g.key !== lastGroup ? (lastGroup = g.key, (
                        <tr key={`g-${g.key}`}><td colSpan={7} className="bg-canvas px-4 py-1.5 text-xs font-semibold text-ink-500">{g.label} · {rows.filter((x) => groupKey(x, sort, props.today).key === g.key).length}</td></tr>
                      )) : null;
                      const future = t.bucket === "tomorrow" || t.bucket === "week" || t.bucket === "later";
                      return [
                        header,
                        <tr key={t.id} onClick={() => setOpenId(t.id)} className={cn("cursor-pointer border-b border-line last:border-0", openId === t.id ? "bg-brand-50/70" : "hover:bg-canvas", t.state === "waiting" && "text-ink-400")}>
                          <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" aria-label={`Select ${t.contact.full_name}`} disabled={t.state === "waiting"} checked={sel.has(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4 accent-[var(--color-brand-500)]" />
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={t.contact.full_name} size={28} />
                              <div className="min-w-0">
                                <div className={cn("truncate font-medium", t.state !== "waiting" && "text-ink-900")}>{t.contact.full_name}</div>
                                <div className="max-w-52 truncate text-xs text-ink-500">{t.contact.title}</div>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-3">{t.account.name}{t.account.tier ? <span className="ml-1 rounded bg-canvas px-1 text-[10px] font-semibold text-ink-500">{t.account.tier}</span> : null}</td>
                          <td className="whitespace-nowrap py-2.5 pr-3">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-50 text-brand-600"><ChannelIcon channel={t.channel} size={13} /></span>
                              {CHANNEL_LABEL[t.channel]} · {t.sequence_no}
                            </span>
                          </td>
                          {!open ? <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-ink-500">{senderOf(t.assignee_id)}</td> : null}
                          <td className="py-2.5 pr-3"><StatePill t={t} /></td>
                          {!open ? (
                            <td className="py-2.5 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                              {future && t.state !== "waiting" ? <button onClick={() => pull([t.id])} disabled={!!working} className="whitespace-nowrap rounded-lg border border-line px-2.5 py-1 text-xs font-medium hover:border-brand-200 hover:text-brand-700">Do today</button> : null}
                            </td>
                          ) : null}
                        </tr>,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<ListChecks size={20} />}
                title={tokens.length || f.q || ch !== "all" ? "Nothing matches" : view === "overdue" ? "Nothing overdue" : view === "today" ? "You're clear for today" : "Nothing here"}
                body={tokens.length || f.q || ch !== "all" ? "Clear a filter to see more." : view === "today" ? "Open Next 7 days to get ahead." : "New steps land here as campaigns launch."}
              />
            )}
            {doneNow.length ? <div className="border-t border-line px-4 py-2.5 text-xs text-ink-500"><b className="text-emerald-600">✓ {doneNow.length} done in this session.</b> Done today counts them.</div> : null}
          </div>

          {selected.length ? (
            <div className="sticky bottom-4 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-ink-900 px-3 py-2.5 text-sm text-white shadow-[var(--shadow-lift)]">
              <b className="mr-1">{selected.length} selected</b>
              {working ? <span className="text-white/70">{working}</span> : (
                <>
                  <button onClick={() => startBatch(selected)} className="rounded-lg bg-brand-500 px-3 py-1.5 font-medium hover:bg-brand-600">Start ({selected.length})</button>
                  {selEmails.length ? <button onClick={() => drafts(selEmails)} className="rounded-lg bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20">Create {selEmails.length} Gmail draft{selEmails.length > 1 ? "s" : ""}</button> : null}
                  {selFuture.length ? <button onClick={() => pull(selFuture)} className="rounded-lg bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20">Do today ({selFuture.length})</button> : null}
                  <button onClick={() => snoozeMany(selected)} className="rounded-lg bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20">Snooze 1 day</button>
                  <button onClick={() => setSel(new Set())} className="ml-auto px-2 text-white/60 hover:text-white">Clear</button>
                </>
              )}
            </div>
          ) : working ? <div className="mt-3 text-sm text-ink-500">{working}</div> : null}
        </div>

        {open ? (
          <TaskPanel
            key={open.id}
            task={open}
            me={props.me}
            users={props.users}
            senderName={senderOf(open.assignee_id)}
            senderEmail={(open.assignee_id ? userById.get(open.assignee_id)?.sendsAs?.email ?? userById.get(open.assignee_id)?.email : null) ?? null}
            today={props.today}
            batch={batch ? { index: Math.max(1, batch.ids.indexOf(open.id) + 1), total: batch.ids.length, done: batch.done } : null}
            onDone={finished}
            onSnoozed={snoozed}
            onPrev={() => move(-1)}
            onNext={() => move(1)}
            onClose={() => { setOpenId(null); setBatch(null); }}
            onEndBatch={() => setBatch(null)}
          />
        ) : null}
      </div>

      {toast ? <div role="status" className="fixed inset-x-0 bottom-20 z-50 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-2xl bg-ink-900 px-5 py-3 text-sm text-white shadow-[var(--shadow-lift)] md:bottom-8">{toast}</div> : null}
      {undo && !toast ? <UndoToast state={undo} onUndo={doUndo} onExpire={() => setUndo(null)} /> : null}
    </>
  );
}

function StatePill({ t }: { t: TodayStep }) {
  if (t.state === "waiting") return <span title={t.state_reason ?? ""} className="inline-flex max-w-56 items-center gap-1 truncate rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink-500"><Lock size={11} className="shrink-0" /><span className="truncate">{t.state_reason?.replace(/^Waits: /, "") ?? "Waiting"}</span></span>;
  if (t.state === "edit") return <span title={t.state_reason ?? ""} className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Needs edit</span>;
  return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Ready</span>;
}

function Select({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label htmlFor={id} className={cn("flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-sm", value ? "bg-brand-50" : "bg-canvas")}>
      <span className="text-ink-500">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="max-w-40 bg-transparent text-right font-medium text-ink-900 outline-none">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
