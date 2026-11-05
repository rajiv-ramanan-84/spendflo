"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Inbox, MessageSquarePlus, Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CLASS_EFFECT, CLASS_LABEL, CLASS_TONE } from "@/lib/responses/labels";
import { diffSummary, type DiffRow } from "@/lib/responses/diff";
import type { CockpitReplan, CockpitResponse } from "@/lib/data/queries";

type Contact = { id: string; full_name: string; title: string | null };

type Props = {
  responses: CockpitResponse[];
  replan: CockpitReplan | null;
  contacts: Contact[];
  campaignId: string | null;
  campaignStatus: string | null;
  focusId: string | null;
  canEdit: boolean;
};

const CLASSES = Object.keys(CLASS_LABEL);
const CHANNELS = [
  ["email", "Email"],
  ["linkedin_message", "LinkedIn message"],
  ["linkedin_connect", "LinkedIn connect"],
  ["call", "Call"],
  ["other", "Other"],
] as const;

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return (await res.json()) as { ok: boolean; error?: string } & Record<string, unknown>;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ResponsePanel(p: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const nameOf = (id: string | null) => p.contacts.find((c) => c.id === id)?.full_name ?? null;

  const pending = p.responses.filter((r) => r.state === "pending");
  const awaitingPlan = p.campaignStatus === "responded" ? p.responses.filter((r) => r.state === "confirmed").slice(0, 1) : [];
  if (!pending.length && !awaitingPlan.length && !p.replan && !p.canEdit) return null;

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setError(r.error ?? "Something went wrong");
    else router.refresh();
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox size={18} className="text-brand-500" />
          <h2 className="text-lg font-semibold">Responses</h2>
          {pending.length > 0 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">{pending.length} to confirm</span>}
        </div>
        {p.canEdit && (
          <Button variant="secondary" onClick={() => setLogOpen((v) => !v)}>
            <MessageSquarePlus size={16} /> Log response
          </Button>
        )}
      </div>
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {logOpen && <LogForm contacts={p.contacts} busy={busy === "log"} onCancel={() => setLogOpen(false)} onSubmit={(body) => run("log", async () => { const r = await post("/api/responses/log", body); if (r.ok) setLogOpen(false); return r; })} />}

      {pending.length === 0 && awaitingPlan.length === 0 && !p.replan && !logOpen && (
        <p className="mt-3 text-sm text-ink-500">No replies waiting. Replies to app drafts show up here within 15 minutes. Use Log response for LinkedIn or calls.</p>
      )}

      <div className="mt-4 grid gap-3">
        {pending.map((r) => (
          <PendingCard key={r.id} r={r} who={nameOf(r.contact_id) ?? r.from_address ?? "Unknown sender"} focused={p.focusId === r.id} busy={busy} canEdit={p.canEdit}
            onConfirm={(classification, pauseOtherTracks) => run(`c-${r.id}`, () => post(`/api/responses/${r.id}/confirm`, { classification, pauseOtherTracks }))}
            onDismiss={() => run(`d-${r.id}`, () => post(`/api/responses/${r.id}/dismiss`))} />
        ))}

        {awaitingPlan.map((r) => (
          <ReplanRequest key={r.id} r={r} who={nameOf(r.contact_id)} busy={busy === "replan"} canEdit={p.canEdit && !!p.campaignId} hasDraft={!!p.replan}
            onRequest={(ownerNextStep, scope) => run("replan", () => post(`/api/campaigns/${p.campaignId}/replan`, { responseId: r.id, ownerNextStep, scope }))} />
        ))}

        {p.replan && <ReplanDraft draft={p.replan} nameOf={nameOf} busy={busy} canEdit={p.canEdit}
          onApply={(contactIds) => run("apply", () => post(`/api/replans/${p.replan!.id}/apply`, { contactIds }))}
          onRegenerate={() => run("replan", () => post(`/api/campaigns/${p.campaignId}/replan`, { responseId: p.replan!.response_id, scope: p.replan!.scope }))} />}
      </div>
    </Card>
  );
}

function PendingCard({ r, who, focused, busy, canEdit, onConfirm, onDismiss }: { r: CockpitResponse; who: string; focused: boolean; busy: string | null; canEdit: boolean; onConfirm: (c: string, pause: boolean) => void; onDismiss: () => void }) {
  const [cls, setCls] = useState(r.classification ?? "");
  const [pause, setPause] = useState(false);
  const [showText, setShowText] = useState(focused);
  return (
    <div className={cn("rounded-2xl border p-4", focused ? "border-brand-300 bg-brand-50/40 ring-2 ring-brand-100" : "border-line bg-white")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{who}</span>
        <span className="text-ink-400">· {r.channel.replace("_", " ")} · {when(r.received_at)}</span>
        {r.classification && <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", CLASS_TONE[r.classification])}>{CLASS_LABEL[r.classification]}{r.confidence !== null && ` · ${Math.round(Number(r.confidence) * 100)}%`}</span>}
        {r.needs_review && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Check this one</span>}
        {!r.contact_id && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">New person at this account</span>}
      </div>
      <p className="mt-2 text-sm text-ink-700">{r.summary}</p>
      {r.return_date && <p className="mt-1 text-xs text-ink-500">Back on {r.return_date}</p>}
      {r.referred_to && <p className="mt-1 text-xs text-ink-500">Pointed to: {r.referred_to}</p>}
      {r.suggested_next_step && <p className="mt-1 text-xs text-ink-500">Suggested next step: {r.suggested_next_step}</p>}
      {r.raw_text && (
        <button className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700" onClick={() => setShowText((v) => !v)}>{showText ? "Hide message" : "Show message"}</button>
      )}
      {showText && r.raw_text && <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-3 font-sans text-sm text-ink-700">{r.raw_text}</pre>}

      {canEdit && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={cls} onChange={(e) => setCls(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
              <option value="" disabled>What kind of reply?</option>
              {CLASSES.map((c) => <option key={c} value={c}>{CLASS_LABEL[c]}</option>)}
            </select>
            {cls === "positive" && (
              <label className="inline-flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} className="accent-brand-500" /> Pause the other tracks
              </label>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" disabled={!!busy} onClick={onDismiss}><X size={16} /> Not a reply</Button>
              <Button disabled={!cls || !!busy} onClick={() => onConfirm(cls, pause)}><Check size={16} /> {busy === `c-${r.id}` ? "Saving..." : "Confirm"}</Button>
            </div>
          </div>
          {cls && <p className="text-xs text-ink-500">{CLASS_EFFECT[cls]}</p>}
        </div>
      )}
    </div>
  );
}

function ReplanRequest({ r, who, busy, canEdit, hasDraft, onRequest }: { r: CockpitResponse; who: string | null; busy: boolean; canEdit: boolean; hasDraft: boolean; onRequest: (next: string, scope: "track" | "campaign") => void }) {
  const [next, setNext] = useState(r.owner_next_step ?? r.suggested_next_step ?? "");
  const [scope, setScope] = useState<"track" | "campaign">("campaign");
  if (hasDraft) return null;
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="text-sm font-semibold">Re-plan after {who ? `${who}'s` : "the"} {CLASS_LABEL[r.classification ?? ""]?.toLowerCase() ?? ""} reply</div>
      <p className="mt-1 text-sm text-ink-600">{r.summary}</p>
      {canEdit ? (
        <>
          <textarea value={next} onChange={(e) => setNext(e.target.value)} rows={2} placeholder="What do you want to happen next? For example: book a call next week, bring in the CFO." className="mt-3 w-full rounded-xl border border-line bg-white p-3 text-sm" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <select value={scope} onChange={(e) => setScope(e.target.value as "track" | "campaign")} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
              <option value="campaign">Whole campaign</option>
              <option value="track">Just this contact</option>
            </select>
            <Button disabled={busy} onClick={() => onRequest(next, scope)} className="ml-auto"><Sparkles size={16} /> {busy ? "Re-planning..." : "Re-plan with Claude"}</Button>
          </div>
          <p className="mt-2 text-xs text-ink-500">Done steps stay as they are. You see every change before anything moves.</p>
        </>
      ) : <p className="mt-2 text-xs text-ink-500">The owner or a manager can re-plan.</p>}
    </div>
  );
}

function StepLine({ s }: { s: { channel: string; date: string | null; subject: string | null } }) {
  return <span className="text-ink-700">{s.channel.replace("_", " ")} {s.date ?? ""}{s.subject ? ` · ${s.subject}` : ""}</span>;
}

const WHAT: Record<string, string> = { channel: "channel", date: "date", subject: "subject", copy: "copy" };

function ReplanDraft({ draft, nameOf, busy, canEdit, onApply, onRegenerate }: { draft: CockpitReplan; nameOf: (id: string | null) => string | null; busy: string | null; canEdit: boolean; onApply: (ids?: string[]) => void; onRegenerate: () => void }) {
  const rows: DiffRow[] = draft.claude_output?.diff ?? [];
  const byContact = new Map<string, DiffRow[]>();
  for (const r of rows) {
    const id = r.kind === "added" ? r.next.contactId : r.old.contactId;
    byContact.set(id, [...(byContact.get(id) ?? []), r]);
  }
  const touched = [...byContact.entries()].filter(([, rs]) => rs.some((x) => x.kind !== "kept"));
  const [picked, setPicked] = useState<string[]>(touched.map(([id]) => id));
  const sum = diffSummary(rows);
  const stale = draft.state === "stale";
  const blocking = draft.claude_output?.validated?.blocking ?? [];

  return (
    <div className={cn("rounded-2xl border p-4", stale ? "border-amber-300 bg-amber-50/50" : "border-brand-200 bg-white")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">Proposed re-plan</div>
        <div className="text-xs text-ink-500">{sum.changed} changed · {sum.added} added · {sum.removed} removed · {sum.kept} kept</div>
      </div>
      {draft.claude_output?.output?.change_summary && <p className="mt-1 text-sm text-ink-700">{draft.claude_output.output.change_summary}</p>}
      {stale && <p className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-800">A new reply came in after this plan was made. Regenerate so it reflects everything.</p>}
      {blocking.map((b, i) => <p key={i} className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{b.text}</p>)}

      <div className="mt-3 grid gap-3">
        {touched.map(([contactId, rs]) => (
          <div key={contactId} className="rounded-xl border border-line p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="accent-brand-500" checked={picked.includes(contactId)} disabled={stale || !canEdit}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, contactId] : p.filter((x) => x !== contactId)))} />
              {nameOf(contactId) ?? "Contact"}
            </label>
            <ul className="mt-2 grid gap-1.5 text-sm">
              {rs.filter((x) => x.kind !== "kept").map((x, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", x.kind === "added" ? "bg-emerald-50 text-emerald-700" : x.kind === "removed" ? "bg-rose-50 text-rose-700 line-through" : "bg-amber-50 text-amber-700")}>{x.kind}</span>
                  {x.kind === "changed" ? (
                    <span className="text-ink-700">
                      {x.old.channel.replace("_", " ")} {x.old.date ?? ""} <ArrowRight size={12} className="inline text-ink-400" /> {x.next.channel.replace("_", " ")} {x.next.date ?? ""}
                      <span className="text-ink-400"> ({x.what.map((w) => WHAT[w] ?? w).join(", ")})</span>
                    </span>
                  ) : (
                    <StepLine s={x.kind === "added" ? x.next : x.old} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {touched.length === 0 && <p className="text-sm text-ink-500">Claude kept the plan as it is.</p>}
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={!!busy} onClick={onRegenerate}><Sparkles size={16} /> {busy === "replan" ? "Re-planning..." : "Regenerate"}</Button>
          {!stale && <Button disabled={!!busy || blocking.length > 0 || (touched.length > 0 && picked.length === 0)} onClick={() => onApply(picked.length === touched.length ? undefined : picked)}><Check size={16} /> {busy === "apply" ? "Applying..." : picked.length === touched.length ? "Apply all" : `Apply ${picked.length}`}</Button>}
        </div>
      )}
    </div>
  );
}

function LogForm({ contacts, busy, onCancel, onSubmit }: { contacts: Contact[]; busy: boolean; onCancel: () => void; onSubmit: (b: Record<string, unknown>) => void }) {
  const [contactId, setContactId] = useState("");
  const [channel, setChannel] = useState("linkedin_message");
  const [cls, setCls] = useState("");
  const [text, setText] = useState("");
  const [next, setNext] = useState("");
  const [pause, setPause] = useState(false);
  return (
    <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-canvas/60 p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="" disabled>Who replied?</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.title ? `, ${c.title}` : ""}</option>)}
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={cls} onChange={(e) => setCls(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="" disabled>What kind?</option>
          {CLASSES.filter((c) => c !== "bounce").map((c) => <option key={c} value={c}>{CLASS_LABEL[c]}</option>)}
        </select>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Paste what they said (optional)" className="rounded-xl border border-line bg-white p-3 text-sm" />
      <input value={next} onChange={(e) => setNext(e.target.value)} placeholder="Your next step (optional)" className="rounded-xl border border-line bg-white px-3 py-2 text-sm" />
      {cls && <p className="text-xs text-ink-500">{CLASS_EFFECT[cls]}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {cls === "positive" && (
          <label className="inline-flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} className="accent-brand-500" /> Pause the other tracks
          </label>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button disabled={busy || !contactId || !cls} onClick={() => onSubmit({ contactId, channel, classification: cls, text: text || null, ownerNextStep: next || null, pauseOtherTracks: pause })}>{busy ? "Saving..." : "Log it"}</Button>
        </div>
      </div>
    </div>
  );
}
