"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, ListChecks, Pin, Target } from "lucide-react";
import type { FocusCard, ReplyCard, TodayStep } from "@/lib/data/today";
import type { UserLite } from "@/lib/data/queries";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, StatTile } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StepRow } from "./step-row";
import { LinkedInSession } from "./linkedin-session";
import { UndoToast, type UndoState } from "./undo-toast";
import { PERSONA_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";

type Bucket = TodayStep["bucket"];
type ChannelGroup = "all" | "linkedin" | "email" | "call" | "other";

const BUCKETS: Array<{ id: Bucket; label: string }> = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This week" },
];

export function groupOf(channel: string): Exclude<ChannelGroup, "all"> {
  if (channel.startsWith("linkedin")) return "linkedin";
  if (channel === "email") return "email";
  if (channel === "call") return "call";
  return "other";
}

const REPLY_TONE: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-800",
  referral: "bg-emerald-50 text-emerald-800",
  neutral: "bg-sky-50 text-sky-800",
  objection: "bg-amber-50 text-amber-800",
  not_now: "bg-amber-50 text-amber-800",
};

export function TodayBoard(props: {
  data: { steps: TodayStep[]; replies: ReplyCard[]; focus: FocusCard[]; header: { dueToday: number; doneToday: number; overdue: number; replies: number } };
  me: string | null;
  users: UserLite[];
  scope: "mine" | "team";
  today: string;
}) {
  const router = useRouter();
  const { steps, replies, focus, header } = props.data;
  const firstBucket: Bucket = steps.some((s) => s.bucket === "overdue") ? "overdue" : "today";
  const [bucket, setBucket] = useState<Bucket>(firstBucket);
  const [group, setGroup] = useState<ChannelGroup>("all");
  const [tier, setTier] = useState("all");
  const [persona, setPersona] = useState("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [session, setSession] = useState(false);
  const [batch, setBatch] = useState<{ running: boolean; done: number; failed: string[] } | null>(null);
  const [pins, setPins] = useState<Set<string>>(new Set(focus.filter((f) => f.pinned).map((f) => f.id)));

  const visible = steps.filter((s) => !hidden.has(s.id));
  const inBucket = visible.filter((s) => s.bucket === bucket);
  const filtered = inBucket.filter(
    (s) => (group === "all" || groupOf(s.channel) === group) && (tier === "all" || s.account.tier === tier) && (persona === "all" || s.contact.persona === persona),
  );
  const groupCounts = { linkedin: 0, email: 0, call: 0, other: 0 };
  for (const s of inBucket) groupCounts[groupOf(s.channel)]++;
  const bucketCounts = Object.fromEntries(BUCKETS.map((b) => [b.id, visible.filter((s) => s.bucket === b.id).length])) as Record<Bucket, number>;
  const personas = [...new Set(steps.map((s) => s.contact.persona).filter(Boolean))] as string[];

  function onActed(stepId: string, label: string) {
    setHidden((h) => new Set(h).add(stepId));
    setUndo({ stepId, label, at: Date.now() });
  }

  async function doUndo() {
    if (!undo) return;
    const res = await fetch(`/api/steps/${undo.stepId}/undo`, { method: "POST" });
    const data = await res.json();
    if (data.ok) setHidden((h) => { const n = new Set(h); n.delete(undo.stepId); return n; });
    setUndo(null);
    router.refresh();
  }

  async function emailBatch() {
    const mine = filtered.filter((s) => s.channel === "email" && s.assignee_id === props.me);
    setBatch({ running: true, done: 0, failed: [] });
    let done = 0;
    const failed: string[] = [];
    for (const s of mine) {
      const res = await fetch(`/api/steps/${s.id}/gmail-draft`, { method: "POST" });
      const data = await res.json().catch(() => ({ ok: false, error: "No response" }));
      if (data.ok) done++; else failed.push(`${s.contact.full_name}: ${data.error}`);
      setBatch({ running: true, done, failed });
    }
    setBatch({ running: false, done, failed });
    router.refresh();
  }

  async function togglePin(id: string) {
    const res = await fetch(`/api/accounts/${id}/pin`, { method: "POST" });
    const data = await res.json();
    if (data.ok) setPins((p) => { const n = new Set(p); if (data.pinned) n.add(id); else n.delete(id); return n; });
  }

  const linkedinSteps = filtered.filter((s) => groupOf(s.channel) === "linkedin");
  const myEmails = filtered.filter((s) => s.channel === "email" && s.assignee_id === props.me);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Due today" value={header.dueToday} />
          <StatTile label="Done today" value={header.doneToday} tone="brand" />
          <StatTile label="Overdue" value={header.overdue} />
          <StatTile label="Replies waiting" value={header.replies} />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-1 text-sm">
        {(["mine", "team"] as const).map((s) => (
          <Link key={s} href={s === "mine" ? "/today" : "/today?scope=team"} className={cn("rounded-full px-3 py-1.5 font-medium", props.scope === s ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-white")}>
            {s === "mine" ? "My day" : "Whole team"}
          </Link>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-5">
        <Card>
          <CardHeader title="Replies waiting" hint="Always on top, so a response never sits." />
          {replies.length ? (
            <ul className="mt-3 divide-y divide-line">
              {replies.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.contact?.full_name ?? r.from_address}</span>
                      <span className="text-sm text-ink-500">{r.account?.name}</span>
                      {r.classification ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", REPLY_TONE[r.classification] ?? "bg-canvas text-ink-700")}>{r.classification.replace("_", " ")}</span> : null}
                      {r.needs_review ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Needs review</span> : null}
                      {r.state === "confirmed" ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">Re-plan waiting</span> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-700">{r.summary}</p>
                  </div>
                  {r.account ? <Link href={`/accounts/${r.account.id}?reply=${r.id}`}><Button variant="secondary" className="px-3 py-1.5">{r.state === "pending" ? "Confirm" : "Re-plan"}</Button></Link> : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Inbox size={20} />} title="No replies waiting" body="When a prospect replies, a confirm card shows up here within 15 minutes." />
          )}
        </Card>

        <Card>
          <CardHeader title="Focus Today" hint="Your top accounts, ranked, with the reason for each." />
          {focus.length ? (
            <div className="mt-3 flex snap-x gap-3 overflow-x-auto px-5 pb-5 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-5">
              {focus.map((f) => (
                <div key={f.id} className="flex w-44 shrink-0 snap-start flex-col rounded-xl border border-line p-3 sm:w-auto">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/accounts/${f.id}`} className="line-clamp-2 font-medium leading-snug hover:text-brand-700">{f.name}</Link>
                    <button onClick={() => togglePin(f.id)} aria-label={pins.has(f.id) ? "Unpin" : "Pin"} className={cn("rounded p-0.5", pins.has(f.id) ? "text-brand-600" : "text-ink-300 hover:text-ink-500")}><Pin size={14} /></button>
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{f.score}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {f.reasons.slice(0, 3).map((r) => <span key={r} className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-700 border border-line">{r}</span>)}
                  </div>
                  <Link href={`/accounts/${f.id}`} className="mt-auto pt-3 text-sm font-medium text-brand-700 hover:underline">{f.nextAction}</Link>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Target size={20} />} title="No accounts yet" body="Ask Mouli to assign your slice. Once the sheet is synced, your ranked list lands here." />
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <h2 className="text-[15px] font-semibold">Steps</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1 text-sm">
                <option value="all">All tiers</option>
                {["A", "B", "C"].map((t) => <option key={t} value={t}>Tier {t}</option>)}
              </select>
              <select value={persona} onChange={(e) => setPersona(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1 text-sm">
                <option value="all">All personas</option>
                {personas.map((p) => <option key={p} value={p}>{PERSONA_LABEL[p] ?? p}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 px-5 text-sm">
            {BUCKETS.map((b) => (
              <button key={b.id} onClick={() => setBucket(b.id)} className={cn("rounded-full px-3 py-1", bucket === b.id ? "bg-ink-900 font-medium text-white" : "text-ink-500 hover:bg-canvas")}>
                {b.label} <span className="tabular-nums opacity-70">{bucketCounts[b.id]}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line px-5 pt-3">
            {(["all", "linkedin", "email", "call", "other"] as const).map((g) => (
              <button key={g} onClick={() => setGroup(g)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", group === g ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line text-ink-700 hover:bg-canvas")}>
                {g === "all" ? `All ${inBucket.length}` : `${g === "linkedin" ? "LinkedIn" : g[0].toUpperCase() + g.slice(1)} ${groupCounts[g]}`}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              {linkedinSteps.length ? <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setSession(true)}>LinkedIn session ({linkedinSteps.length})</Button> : null}
              {myEmails.length ? (
                <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={batch?.running} onClick={emailBatch}>
                  {batch?.running ? `Creating drafts ${batch.done}/${myEmails.length}…` : `Create all drafts (${myEmails.length})`}
                </Button>
              ) : null}
            </div>
          </div>
          {batch && !batch.running ? (
            <div className="mx-5 mt-3 rounded-xl border border-line bg-canvas px-3 py-2 text-sm">
              {batch.done} draft{batch.done === 1 ? "" : "s"} ready in Gmail.{batch.failed.length ? ` ${batch.failed.length} need attention: ${batch.failed.join("; ")}` : ""}
            </div>
          ) : null}

          {filtered.length ? (
            <ul className="mt-3 divide-y divide-line">
              {filtered.map((s) => (
                <StepRow key={s.id} step={s} me={props.me} users={props.users} onActed={onActed} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<ListChecks size={20} />}
              title={bucket === "today" && !bucketCounts.overdue ? "You're clear for today" : "Nothing here"}
              body={bucket === "today" ? "Pull ahead from Tomorrow or This week, or open a Focus account to get ahead." : "Try another bucket or channel."}
            />
          )}
        </Card>
      </div>

      {session ? <LinkedInSession steps={linkedinSteps} onClose={() => { setSession(false); router.refresh(); }} onDone={(id) => setHidden((h) => new Set(h).add(id))} /> : null}
      {undo ? <UndoToast state={undo} onUndo={doUndo} onExpire={() => setUndo(null)} /> : null}
    </>
  );
}
