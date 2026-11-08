"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Lightbulb, Lock, MoreHorizontal, UserPlus, X } from "lucide-react";
import type { AttackPlan, NurturePerson, PlanPerson } from "@/lib/campaigns/attack-plan";
import { ChannelIcon } from "@/components/ui/channel";
import { fmtDate, PERSONA_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";


const PROMOTE_REASONS = ["Common connection", "Signal from them", "Referred by someone we spoke to", "The account went quiet", "Other"];

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json().catch(() => ({ ok: false, error: "No response" }));
}

export function AttackPlanCard(props: {
  plan: AttackPlan;
  job: string | null;
  objective: string | null;
  campaignId: string | null;
  campaignStatus: string | null;
  canEdit: boolean;
  colorOf: Record<string, string>;
  today: string;
}) {
  const router = useRouter();
  const { plan } = props;
  const [shelf, setShelf] = useState(plan.nurture.length > 0 && plan.active.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const editable = props.canEdit && !!props.campaignId && !["closed_no_response", "disqualified", "recycle"].includes(props.campaignStatus ?? "");

  async function run(key: string, url: string, body: unknown) {
    setBusy(key);
    setError(null);
    const d = await post(url, body);
    setBusy(null);
    if (!d.ok) return setError(d.error);
    router.refresh();
  }

  const overCap = plan.active.length > plan.cap;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Account attack plan</div>
          <h2 className="mt-1 text-lg font-semibold leading-snug">{props.job ? props.job[0].toUpperCase() + props.job.slice(1) : "The plan"}</h2>
          {props.objective ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">{props.objective}</p> : null}
        </div>
        <div className="flex shrink-0 gap-2 text-center">
          <Stat n={plan.active.length} label="active" tone={overCap ? "warn" : "brand"} sub={`of ${plan.cap} max`} />
          <Stat n={plan.nurture.length} label="nurture" />
          <Stat n={plan.found} label="found" />
        </div>
      </div>

      {plan.advice ? (
        <div className={cn("mx-5 mb-4 flex gap-2 rounded-xl px-3 py-2.5 text-sm", overCap ? "bg-amber-50 text-amber-900" : "bg-brand-50/70 text-ink-700")}>
          <Lightbulb size={16} className={cn("mt-0.5 shrink-0", overCap ? "text-amber-600" : "text-brand-500")} />
          <span>{plan.advice}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4">
        <span className="mr-1 text-xs text-ink-400">Roles covered</span>
        {plan.coverage.map((c) => (
          <span key={c.role} title={c.by.length ? `Covered by ${c.by.join(", ")}` : "Nobody active in this role"}
            className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", c.covered ? "bg-emerald-50 text-emerald-800" : "bg-canvas text-ink-400 ring-1 ring-line")}>
            {c.covered ? <Check size={11} /> : <X size={11} />}{c.role}
          </span>
        ))}
      </div>

      <div className="grid gap-px border-t border-line bg-line md:grid-cols-3">
        {plan.waves.map((w, wi) => (
          <div key={w.wave} className="relative bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-semibold">{w.label}</div>
              <div className="text-xs text-ink-400">{w.from ? `from ${w.from <= props.today ? "now" : fmtDate(w.from)}` : w.people.length ? "" : ""}</div>
            </div>
            <div className="text-xs text-ink-400">{w.hint}</div>
            {wi < 2 ? <ArrowRight size={14} className="absolute -right-2 top-5 z-10 hidden rounded-full bg-white text-ink-300 md:block" /> : null}
            <div className="mt-3 flex flex-col gap-2">
              {w.people.map((p) => (
                <PersonCard key={p.trackId} p={p} color={props.colorOf[p.contactId] ?? "bg-ink-400"} today={props.today} editable={editable} busy={busy === p.trackId}
                  onNurture={(reason) => run(p.trackId, `/api/tracks/${p.trackId}/nurture`, { reason })} />
              ))}
              {!w.people.length ? <div className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-400">{w.wave === 3 ? "Nobody waits on a reply yet" : "Nobody in this wave"}</div> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-line">
        <button onClick={() => setShelf((s) => !s)} aria-expanded={shelf} className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm">
          <span className="font-semibold">Nurture</span>
          <span className="rounded-full bg-canvas px-2 text-xs font-semibold text-ink-500">{plan.nurture.length}</span>
          <span className="min-w-0 flex-1 truncate text-ink-400">No touches until something pulls them in: a common connection, a signal or a referral.</span>
          <ChevronDown size={16} className={cn("shrink-0 text-ink-400 transition-transform", shelf && "rotate-180")} />
        </button>
        {shelf ? (
          <ul className="divide-y divide-line border-t border-line">
            {plan.nurture.map((n) => (
              <NurtureRow key={n.contactId} n={n} editable={editable} busy={busy === n.contactId}
                onActivate={(reason) => n.trackId
                  ? run(n.contactId, `/api/tracks/${n.trackId}/activate`, { reason })
                  : run(n.contactId, `/api/campaigns/${props.campaignId}/add-person`, { contactId: n.contactId, reason })} />
            ))}
            {!plan.nurture.length ? <li className="px-5 py-4 text-sm text-ink-400">Nobody in nurture. Everyone found is in the plan.</li> : null}
            {plan.outside.length ? <li className="px-5 py-3 text-xs text-ink-400">Not contacted: {plan.outside.map((o) => `${o.name} (${o.why.toLowerCase()})`).join(", ")}</li> : null}
          </ul>
        ) : null}
      </div>
      {error ? <p role="alert" className="mx-5 mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}

function Stat({ n, label, sub, tone }: { n: number; label: string; sub?: string; tone?: "brand" | "warn" }) {
  return (
    <div className={cn("min-w-16 rounded-xl px-3 py-2", tone === "warn" ? "bg-amber-50" : tone === "brand" ? "bg-brand-50" : "bg-canvas")}>
      <div className={cn("text-xl font-semibold tabular-nums leading-none", tone === "warn" ? "text-amber-700" : tone === "brand" ? "text-brand-700" : "text-ink-900")}>{n}</div>
      <div className="mt-1 text-[11px] text-ink-500">{label}{sub ? <span className="block text-ink-400">{sub}</span> : null}</div>
    </div>
  );
}

function PersonCard({ p, color, today, editable, busy, onNurture }: { p: PlanPerson; color: string; today: string; editable: boolean; busy: boolean; onNurture: (reason: string) => void }) {
  const [menu, setMenu] = useState(false);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const ended = ["stopped", "completed"].includes(p.status);
  return (
    <div className={cn("relative rounded-xl border border-line p-3 transition hover:shadow-sm", ended && "opacity-60")}>
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", color)} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{p.name}</div>
          <div className="truncate text-xs text-ink-500">{p.title}</div>
        </div>
        {editable && !ended ? (
          <button onClick={() => setMenu((m) => !m)} aria-label={`More for ${p.name}`} className="rounded-md p-1 text-ink-300 hover:bg-canvas hover:text-ink-700"><MoreHorizontal size={15} /></button>
        ) : null}
        {menu ? (
          <div className="absolute right-2 top-9 z-20 w-44 overflow-hidden rounded-xl border border-line bg-white py-1 text-sm shadow-[var(--shadow-lift)]">
            <button className="block w-full px-3 py-2 text-left hover:bg-canvas" onClick={() => { setMenu(false); setAsking(true); }}>Move to nurture</button>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[18px] text-xs">
        {p.persona ? <span className="rounded-full bg-canvas px-2 py-0.5 text-ink-600 ring-1 ring-line">{PERSONA_LABEL[p.persona] ?? p.persona}</span> : null}
        <span className="text-ink-500">{p.firstTouch ? `${p.done ? "Started" : p.projected ? "Expected" : "Starts"} ${p.firstTouch <= today && !p.done ? "today" : fmtDate(p.firstTouch)}` : "No date yet"}</span>
      </div>
      <div className="mt-2 flex items-center gap-1 pl-[18px] text-ink-400">
        {p.channels.map((c) => <ChannelIcon key={c} channel={c} size={13} />)}
        <span className="ml-1 text-xs">{p.done}/{p.steps} steps</span>
        {p.status === "paused" ? <span className="ml-auto rounded-full bg-canvas px-2 text-[11px] text-ink-500 ring-1 ring-line">Paused</span> : null}
        {p.status === "replied" || p.status === "meeting" ? <span className="ml-auto rounded-full bg-emerald-50 px-2 text-[11px] font-medium text-emerald-800">{p.status === "meeting" ? "Meeting" : "Replied"}</span> : null}
      </div>
      {p.waitsOn || p.unlocks.length ? (
        <div className="mt-2 border-t border-dashed border-line pl-[18px] pt-2 text-xs text-ink-500">
          {p.waitsOn ? <div className="flex items-center gap-1"><Lock size={11} />{p.basis?.startsWith("Stuck") ? p.basis : `After ${p.waitsOn}${p.basis?.includes("replies") ? " replies" : ""}`}</div> : null}
          {p.unlocks.length ? <div>Unlocks {p.unlocks.join(", ")}</div> : null}
        </div>
      ) : null}
      {asking ? (
        <form className="mt-2 flex flex-col gap-1.5" onSubmit={(e) => { e.preventDefault(); onNurture(reason); setAsking(false); }}>
          <input id={`nurture-${p.trackId}`} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why hold them back? (optional)" className="rounded-lg border border-line px-2 py-1.5 text-xs focus:border-brand-300 focus:outline-none" />
          <div className="flex gap-1.5">
            <button type="submit" disabled={busy} className="rounded-lg bg-ink-900 px-2.5 py-1 text-xs font-medium text-white">Move to nurture</button>
            <button type="button" onClick={() => setAsking(false)} className="px-2 text-xs text-ink-500">Cancel</button>
          </div>
          <p className="text-[11px] text-ink-400">Their steps stay saved without dates. Make them active any time.</p>
        </form>
      ) : null}
    </div>
  );
}

function NurtureRow({ n, editable, busy, onActivate }: { n: NurturePerson; editable: boolean; busy: boolean; onActivate: (reason: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState(PROMOTE_REASONS[0]);
  const [note, setNote] = useState("");
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{n.name}</span>
          <span className="text-ink-500">{n.title}</span>
          {n.persona ? <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-500 ring-1 ring-line">{PERSONA_LABEL[n.persona] ?? n.persona}</span> : null}
          {n.hasSteps ? <span className="text-xs text-ink-400">steps saved</span> : null}
        </div>
        {n.reason ? <div className="text-xs text-ink-400">{n.reason}</div> : null}
      </div>
      {editable ? (
        asking ? (
          <form className="flex w-full flex-wrap items-center gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); onActivate(why === "Other" ? note || "Other" : note ? `${why}: ${note}` : why); setAsking(false); }}>
            <select id={`why-${n.contactId}`} value={why} onChange={(e) => setWhy(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs">
              {PROMOTE_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
            <input id={`note-${n.contactId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detail (optional)" className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1.5 text-xs sm:w-40" />
            <button type="submit" disabled={busy} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600">{n.hasSteps ? "Start from today" : "Add to campaign"}</button>
            <button type="button" onClick={() => setAsking(false)} className="text-xs text-ink-500">Cancel</button>
          </form>
        ) : (
          <button onClick={() => setAsking(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-brand-200 hover:text-brand-700">
            <UserPlus size={13} />Make active
          </button>
        )
      ) : null}
    </li>
  );
}
