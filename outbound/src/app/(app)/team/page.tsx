import Link from "next/link";
import { AlertTriangle, ArrowUpRight, X } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/calendar/dates";
import { computeMetrics, type Drill } from "@/lib/metrics/compute";
import { loadDrill, loadMetricsSnapshot } from "@/lib/metrics/load";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { CAMPAIGN_STATUS_LABEL, firstName, fmtDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

type Search = { range?: string; owner?: string; tier?: string; segment?: string; drill?: string };

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
];

// The engagement scale (PRD section 9): same colours in the app, the sheet and Slack.
const FUNNEL_COLOR: Record<string, string> = {
  assigned: "bg-eng-not-contacted",
  touched: "bg-eng-contacted",
  connected: "bg-eng-connected",
  engaged: "bg-eng-replied",
  meeting: "bg-eng-meeting",
};

const DRILL_TITLE: Record<string, string> = {
  assigned: "Accounts assigned",
  live: "Campaigns live",
  coverage: "Accounts with a live campaign",
  penetration: "Penetrated accounts",
  replies: "Accounts with replies",
  meetings: "Meetings booked",
  dueToday: "Steps due today",
  onTime: "Steps not done on time",
  multiThreaded: "Multi-threaded accounts",
  stalled: "Stalled campaigns",
  accounts: "Accounts",
  doneInRange: "Steps done",
  overdue: "Overdue steps",
};

function href(s: Search, patch: Partial<Search>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...s, ...patch })) if (v) p.set(k, v);
  const q = p.toString();
  return `/team${q ? `?${q}` : ""}#${patch.drill ? "drill" : "top"}`;
}

function Pill({ to, on, children }: { to: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={to} scroll={false} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", on ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-ink-700 hover:border-brand-200 hover:bg-brand-50")}>
      {children}
    </Link>
  );
}

function Num({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={to} scroll={false} className={cn("rounded-md tabular-nums underline-offset-4 hover:text-brand-600 hover:underline", className)}>
      {children}
    </Link>
  );
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireUser();
  const s = await searchParams;
  const db = await createSupabaseServerClient();
  const today = todayIn();
  const range = RANGES.some((r) => r.key === s.range) ? s.range! : "30";
  const from = addDays(today, -Number(range));
  const snap = await loadMetricsSnapshot(db, `${addDays(from, -30)}T00:00:00Z`);
  const m = computeMetrics(snap, { from, today, now: new Date(), ownerId: s.owner ?? null, tier: s.tier ?? null, segment: s.segment ?? null });
  const userName = new Map(snap.users.map((u) => [u.id, u.name]));
  const userIndex = new Map(snap.users.map((u, i) => [u.id, i]));
  const segments = [...new Set(snap.accounts.map((a) => a.segment).filter(Boolean))] as string[];
  const base: Search = { range: s.range, owner: s.owner, tier: s.tier, segment: s.segment };

  const drill: (Drill & { key: string }) | null = s.drill && m.drill[s.drill] ? { key: s.drill, ...m.drill[s.drill] } : null;
  const drillRows = drill ? await loadDrill(db, drill.kind, drill.ids) : [];
  const drillTitle = (() => {
    if (!drill) return "";
    const parts = drill.key.split(":");
    if (parts[0] === "funnel") return `${m.funnel.find((f) => f.key === parts[1])?.label} accounts`;
    if (parts[0] === "owner") return `${userName.get(parts[1])}: ${DRILL_TITLE[parts[2]] ?? parts[2]}`;
    return DRILL_TITLE[drill.key] ?? drill.key;
  })();

  const k = m.kpis;
  const assigned = m.funnel[0].value;
  const engagedN = m.funnel[3].value;
  const tiles = [
    { key: "assigned", label: "Accounts assigned", value: String(k.assigned), sub: `${k.coverage}% have a live campaign` },
    { key: "live", label: "Campaigns live", value: String(k.live), sub: `${k.multiThreaded} multi-threaded` },
    { key: "penetration", label: "Penetration rate", value: `${k.penetration}%`, sub: `${engagedN} of ${assigned} accounts`, brand: true },
    { key: "replies", label: `Replies, ${range} days`, value: String(k.replies), sub: "Two-way, any channel" },
    { key: "meetings", label: `Meetings, ${range} days`, value: String(k.meetings), sub: "Booked from campaigns" },
    { key: "dueToday", label: "Steps due today", value: String(k.dueToday), sub: "Whole team" },
    { key: "onTime", label: "On time", value: `${k.onTime}%`, sub: "Done by the due date" },
  ];

  return (
    <div id="top">
      <PageHeader title="Command Center" subtitle="One shared picture of everything in motion. Click any number to see the list behind it." />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => <Pill key={r.key} to={href(base, { range: r.key, drill: undefined })} on={range === r.key}>{r.label}</Pill>)}
        <span className="mx-1 h-6 w-px bg-line" />
        <Pill to={href(base, { owner: undefined, drill: undefined })} on={!s.owner}>Everyone</Pill>
        {snap.users.map((u) => <Pill key={u.id} to={href(base, { owner: u.id, drill: undefined })} on={s.owner === u.id}>{firstName(u.name)}</Pill>)}
        <span className="mx-1 h-6 w-px bg-line" />
        <Pill to={href(base, { tier: undefined, drill: undefined })} on={!s.tier}>All tiers</Pill>
        {["A", "B", "C"].map((t) => <Pill key={t} to={href(base, { tier: t, drill: undefined })} on={s.tier === t}>Tier {t}</Pill>)}
        {segments.length > 0 && (
          <>
            <span className="mx-1 h-6 w-px bg-line" />
            <Pill to={href(base, { segment: undefined, drill: undefined })} on={!s.segment}>All segments</Pill>
            {segments.map((g) => <Pill key={g} to={href(base, { segment: g, drill: undefined })} on={s.segment === g}>{g}</Pill>)}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <Link key={t.key} href={href(base, { drill: t.key })} scroll={false}
            className={cn("group rounded-[var(--radius-card)] border bg-white px-4 py-4 shadow-[var(--shadow-soft)] transition-colors hover:border-brand-200", s.drill === t.key ? "border-brand-400 ring-2 ring-brand-100" : "border-line")}>
            <div className="flex items-center justify-between text-xs font-medium text-ink-500">{t.label}<ArrowUpRight size={13} className="text-ink-300 group-hover:text-brand-500" /></div>
            <div className={cn("mt-1 text-[26px] font-semibold tabular-nums leading-tight", t.brand ? "text-brand-600" : "text-ink-900")}>{t.value}</div>
            <div className="mt-0.5 truncate text-xs text-ink-400">{t.sub}</div>
          </Link>
        ))}
      </div>

      {drill && (
        <Card id="drill" className="mt-5 scroll-mt-24">
          <CardHeader title={drillTitle} hint={`${drill.ids.length} ${drill.kind}${drill.ids.length > 200 ? ", first 200 shown" : ""}`}
            action={<Link href={href(base, {})} scroll={false} aria-label="Close" className="rounded-lg p-1.5 text-ink-400 hover:bg-canvas hover:text-ink-700"><X size={16} /></Link>} />
          {drillRows.length ? (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {drillRows.map((r, i) => (
                <li key={i}>
                  <Link href={`/accounts/${r.accountId}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5 text-sm hover:bg-brand-50/40 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_auto]">
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="hidden truncate text-ink-500 md:block">{r.detail}{"status" in r && r.status ? ` · ${CAMPAIGN_STATUS_LABEL[r.status as string]}` : ""}</span>
                    <span className="hidden text-ink-500 tabular-nums md:block">{r.date ? fmtDate(r.date) : ""}</span>
                    <span className="inline-flex items-center gap-1.5 text-ink-500">{r.ownerId ? <><Avatar name={userName.get(r.ownerId) ?? "?"} index={userIndex.get(r.ownerId) ?? 0} size={20} />{firstName(userName.get(r.ownerId) ?? "")}</> : "Unassigned"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 pb-5 pt-3 text-sm text-ink-500">Nothing here right now.</p>}
        </Card>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Penetration funnel" hint="Accounts at each stage. Engaged means a persona replied or met: that is penetration." />
          <div className="grid gap-2.5 p-5">
            {m.funnel.map((f) => {
              const w = assigned ? Math.max(f.value ? 2 : 0, (f.value / assigned) * 100) : 0;
              const share = assigned ? Math.round((f.value / assigned) * 100) : 0;
              return (
                <Link key={f.key} href={href(base, { drill: `funnel:${f.key}` })} scroll={false} className="group relative grid grid-cols-[88px_minmax(0,1fr)_72px] items-center gap-3 rounded-lg py-1 text-sm">
                  <span className="font-medium text-ink-700">{f.label}</span>
                  <span className="relative h-7 rounded-[4px] bg-canvas">
                    <span className={cn("absolute inset-y-0 left-0 rounded-[4px] transition-opacity group-hover:opacity-80", FUNNEL_COLOR[f.key])} style={{ width: `${w}%` }} />
                    <span role="tooltip" className="pointer-events-none absolute -top-9 left-2 z-10 hidden whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
                      {f.label}: {f.value} accounts, {share}% of assigned
                    </span>
                  </span>
                  <span className="text-right tabular-nums"><span className="font-semibold text-ink-900">{f.value}</span> <span className="text-ink-400">{share}%</span></span>
                </Link>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Reply rate by channel" hint="People who replied on a channel, out of people we reached on it." />
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-400"><th className="px-5 py-2 font-medium">Channel</th><th className="px-2 py-2 text-right font-medium">Reached</th><th className="px-2 py-2 text-right font-medium">Replied</th><th className="px-5 py-2 text-right font-medium">Rate</th></tr></thead>
            <tbody className="divide-y divide-line border-t border-line">
              {m.replyRate.map((r) => (
                <tr key={r.channel}>
                  <td className="px-5 py-2.5 capitalize">{r.channel === "linkedin" ? "LinkedIn" : r.channel}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{r.contacted}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{r.replied}</td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{r.contacted ? `${r.rate}%` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader title="By owner" hint={`Done, replies and meetings over the last ${range} days. Overdue is a count, not a callout.`} />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400">
                {["Owner", "Accounts", "Live", "Due today", "Overdue", "Done", "Replies", "Meetings", "Penetration", "On time", "Reply to re-plan"].map((h, i) => (
                  <th key={h} className={cn("py-2 font-medium", i === 0 ? "px-5" : "px-2 text-right", i === 8 && "w-44")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-t border-line">
              {m.owners.map((o) => {
                const d = (key: string) => href(base, { drill: `owner:${o.userId}:${key}` });
                return (
                  <tr key={o.userId} className="hover:bg-canvas/60">
                    <td className="px-5 py-3"><span className="inline-flex items-center gap-2 font-medium"><Avatar name={o.name} index={userIndex.get(o.userId) ?? 0} size={24} />{o.name}</span></td>
                    <td className="px-2 text-right"><Num to={d("accounts")}>{o.accounts}</Num></td>
                    <td className="px-2 text-right"><Num to={d("live")}>{o.live}</Num></td>
                    <td className="px-2 text-right"><Num to={d("dueToday")}>{o.dueToday}</Num></td>
                    <td className="px-2 text-right"><Num to={d("overdue")} className="text-ink-500">{o.overdue}</Num></td>
                    <td className="px-2 text-right"><Num to={d("doneInRange")}>{o.doneInRange}</Num></td>
                    <td className="px-2 text-right"><Num to={d("replies")}>{o.replies}</Num></td>
                    <td className="px-2 text-right"><Num to={d("meetings")}>{o.meetings}</Num></td>
                    <td className="px-2">
                      <Link href={d("penetration")} scroll={false} className="group relative flex items-center justify-end gap-2" title={`${o.name}: ${o.penetration}% of ${o.accounts} accounts penetrated`}>
                        <span className="h-2 w-24 rounded-[4px] bg-canvas"><span className="block h-2 rounded-[4px] bg-brand-500" style={{ width: `${o.penetration}%` }} /></span>
                        <span className="w-10 text-right font-semibold tabular-nums group-hover:text-brand-600">{o.penetration}%</span>
                      </Link>
                    </td>
                    <td className="px-2 text-right tabular-nums">{o.onTime === null ? "–" : `${o.onTime}%`}</td>
                    <td className="px-5 text-right tabular-nums text-ink-500">{o.replanHours === null ? "–" : `${o.replanHours} h`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader title="Campaigns in motion" hint="Sorted by what needs attention: replies waiting, stalled, then overdue." />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-xs text-ink-400">{["Account", "Owner", "Day", "Last touch", "Next step", "Status"].map((h, i) => <th key={h} className={cn("py-2 font-medium", i === 0 ? "px-5" : "px-2")}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line border-t border-line">
                {m.motion.slice(0, 25).map((c) => (
                  <tr key={c.campaignId} className="hover:bg-canvas/60">
                    <td className="px-5 py-2.5"><Link href={`/accounts/${c.accountId}`} className="font-medium hover:text-brand-600">{c.accountName}</Link> <span className="text-xs text-ink-400">Tier {c.tier ?? "-"}</span></td>
                    <td className="px-2">{firstName(userName.get(c.ownerId) ?? "")}</td>
                    <td className="px-2 tabular-nums text-ink-500">{c.day} of {c.span}</td>
                    <td className="px-2 tabular-nums text-ink-500">{c.lastTouch ? fmtDate(c.lastTouch) : "–"}</td>
                    <td className="px-2 tabular-nums">{c.nextStep ? fmtDate(c.nextStep) : "–"}{c.overdue ? <span className="ml-1.5 text-xs text-ink-400">({c.overdue} overdue)</span> : null}</td>
                    <td className="px-2 pr-5">
                      {c.repliesWaiting ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Reply waiting</span>
                        : <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-700">{CAMPAIGN_STATUS_LABEL[c.status]}</span>}
                    </td>
                  </tr>
                ))}
                {m.motion.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-sm text-ink-500">No live campaigns yet. Launch one from an account.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Stalled" hint="Overdue more than 2 days, or a reply not re-planned in 24 hours." action={m.stalled.length ? <Num to={href(base, { drill: "stalled" })} className="text-sm font-semibold">{m.stalled.length}</Num> : null} />
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {m.stalled.map((c) => (
              <li key={c.campaignId}>
                <Link href={`/accounts/${c.accountId}`} className="flex items-start gap-3 px-5 py-3 text-sm hover:bg-canvas/60">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  <span className="min-w-0">
                    <span className="block font-medium">{c.accountName}</span>
                    <span className="block text-ink-500">{c.stalledReason} · {firstName(userName.get(c.ownerId) ?? "")}</span>
                  </span>
                </Link>
              </li>
            ))}
            {m.stalled.length === 0 && <li className="px-5 py-6 text-sm text-ink-500">Nothing stalled. Good momentum.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
