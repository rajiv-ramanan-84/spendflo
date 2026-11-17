"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {Check, Link2, Plus, Trash2} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FLASH } from "@/lib/mailbox-flash";
import { Meter, StatePill, type InboxView } from "@/components/sending/ui";

type User = { id: string; name: string; email: string; mailboxId: string | null };
type Mailbox = { id: string; email: string; writesAs: string; writesAsId: string; status: string; connectedAt: string | null; usedBy: string[]; operators: Array<{ id: string; name: string }> };
type Props = { users: User[]; mailboxes: Mailbox[]; redirectUri: string; canEdit: boolean; canAdd: boolean; meId: string | null; flash: string | null; usage: Record<string, InboxView> };

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm disabled:bg-canvas";

export function MailboxSettings(p: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [writesAs, setWritesAs] = useState(p.users[0]?.id ?? "");
  const [usedBy, setUsedBy] = useState(p.users[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(p.flash ? (FLASH[p.flash] ?? null) : null);

  async function send(key: string, url: string, method: string, body?: unknown) {
    setBusy(key);
    setMsg(null);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({ ok: false, error: "No response" }));
    setBusy(null);
    if (!data.ok) return setMsg({ ok: false, text: data.error });
    router.refresh();
    return data;
  }

  const sendsFrom = (u: User) => p.mailboxes.find((m) => m.id === u.mailboxId);

  return (
    <Card id="mailboxes" className="scroll-mt-24 p-5 md:p-6">
      <h2 className="sr-only">Mailboxes</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-500">Everyone signs in as themselves. Their accounts&apos; emails go out from their own Gmail, or from a shared mailbox (for example sid@ run by Mouli, written as Sid). A shared mailbox can&apos;t sign in; it is connected here once.</p>

      {msg ? <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p> : null}

      <div className="mt-5">
        <div className="text-sm font-medium">Sends as</div>
        <div className="mt-2 divide-y divide-line rounded-2xl border border-line">
          {p.users.map((u) => {
            const m = sendsFrom(u);
            return (
              <div key={u.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium">{u.name}&apos;s accounts</span>
                {p.canEdit ? (
                  <select value={u.mailboxId ?? ""} disabled={busy !== null} onChange={(e) => send(`a-${u.id}`, "/api/mailboxes/assign", "PATCH", { userId: u.id, mailboxId: e.target.value || null })} className={input}>
                    <option value="">From {u.name}&apos;s own Gmail ({u.email})</option>
                    {p.mailboxes.map((mb) => <option key={mb.id} value={mb.id}>From {mb.email}, written as {mb.writesAs}</option>)}
                  </select>
                ) : <span className="text-ink-600">{m ? `From ${m.email}, written as ${m.writesAs}` : `From ${u.email}`}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {p.mailboxes.length ? (
        <div className="mt-5">
          <div className="text-sm font-medium">Shared mailboxes</div>
          <ul className="mt-2 grid gap-2">
            {p.mailboxes.map((m) => {
              const ok = m.status === "ok";
              const mine = p.users.find((u) => u.id === p.meId)?.mailboxId === m.id;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{m.email}</span>
                    <span className="text-ink-500"> · written as {m.writesAs}{m.usedBy.length ? ` · used by ${m.usedBy.join(", ")}` : " · nobody sends from it yet"}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{ok ? "Connected" : m.status === "expired" ? "Reconnect needed" : "Not connected"}</span>
                    {p.usage[m.id] ? <span className="ml-1.5"><StatePill i={p.usage[m.id]} hideConnection /></span> : null}
                  </span>
                  <span className="flex gap-2">
                    {p.usage[m.id]?.paused ? <button onClick={() => send(`p-${m.id}`, `/api/mailboxes/${m.id}/pause`, "POST", { paused: false })} className="rounded-xl border border-line px-3 py-1.5 text-xs font-medium hover:border-brand-200">Resume</button> : p.usage[m.id] ? <button onClick={() => send(`p-${m.id}`, `/api/mailboxes/${m.id}/pause`, "POST", { paused: true })} className="rounded-xl border border-line px-3 py-1.5 text-xs text-ink-600 hover:border-brand-200">Pause</button> : null}
                    {p.canEdit || mine ? <a href={`/api/mailboxes/connect?mailbox=${m.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"><Link2 size={14} /> {ok ? "Reconnect" : "Connect"}</a> : null}
                    {p.canEdit ? <button onClick={() => confirm(`Remove ${m.email}? Anyone sending from it goes back to their own Gmail.`) && send(`d-${m.id}`, `/api/mailboxes/${m.id}`, "DELETE")} className="rounded-xl px-2 py-1.5 text-ink-400 hover:bg-canvas hover:text-rose-600" aria-label={`Remove ${m.email}`}><Trash2 size={15} /></button> : null}
                  </span>
                  {p.usage[m.id] ? (
                    <div className="basis-full">
                      <Meter sent={p.usage[m.id].sent} warn={p.usage[m.id].warn} max={p.usage[m.id].max} state={p.usage[m.id].state} />
                      <div className="mt-1 flex justify-between text-xs text-ink-500"><span>{p.usage[m.id].sent} of {p.usage[m.id].max} sent today{p.usage[m.id].core ? " · company domain" : ""}</span>{p.usage[m.id].paused && p.usage[m.id].pausedReason ? <span className="text-rose-700">{p.usage[m.id].pausedReason}</span> : null}</div>
                    </div>
                  ) : null}
                  <div className="basis-full text-xs text-ink-500">
                    <span>Also run by: </span>
                    {m.operators.length ? m.operators.map((o) => (
                      <span key={o.id} className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-ink-700">{o.name}{p.canEdit ? <button aria-label={`Remove ${o.name}`} onClick={() => send(`o-${m.id}-${o.id}`, `/api/mailboxes/${m.id}/operators`, "DELETE", { userId: o.id })} className="text-ink-400 hover:text-rose-600">×</button> : null}</span>
                    )) : <span>nobody else</span>}
                    {p.canEdit ? <select aria-label="Add a person who runs this mailbox" value="" onChange={(e) => e.target.value && send(`o-${m.id}`, `/api/mailboxes/${m.id}/operators`, "POST", { userId: e.target.value })} className="ml-1 rounded-lg border border-line bg-white px-2 py-1 text-xs"><option value="">Add a person</option>{p.users.filter((u) => !m.operators.some((o) => o.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select> : null}
                    <a href={`/settings/writing/rules?tab=mailbox&mailbox=${m.id}`} className="ml-2 font-medium text-brand-700 hover:underline">Edit voice and signature</a>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-ink-400">To connect: click Connect while signed into the shared mailbox in this browser (Google lets you switch accounts on the consent screen).</p>
        </div>
      ) : null}

      {p.canAdd ? (
        <div className="mt-5 rounded-2xl border border-dashed border-line p-4">
          <div className="text-sm font-medium">Add a shared mailbox</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-xs text-ink-500">Address<input className={input} placeholder="sid@spendflo.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} /></label>
            <label className="grid gap-1 text-xs text-ink-500">Written as<select className={input} value={writesAs} onChange={(e) => setWritesAs(e.target.value)}>{p.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-ink-500">Used by<select className={input} disabled={!p.canEdit} value={p.canEdit ? usedBy : (p.meId ?? usedBy)} onChange={(e) => setUsedBy(e.target.value)}>{p.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button disabled={busy !== null || !email.includes("@")} onClick={async () => { const d = await send("add", "/api/mailboxes", "POST", { email, writesAsUserId: writesAs, usedByUserId: p.canEdit ? usedBy : (p.meId ?? usedBy) }); if (d?.ok) { setEmail(""); setMsg({ ok: true, text: `Added. Now click Connect next to ${email}.` }); } }}>
              {busy === "add" ? "Adding..." : <><Plus size={16} /> Add</>}
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-400">One-time Google setup: add <code className="rounded bg-canvas px-1">{p.redirectUri}</code> to Authorized redirect URIs on the Google sign-in client (Google Cloud &gt; Google Auth Platform &gt; Clients).</p>
        </div>
      ) : null}
      {busy && busy !== "add" ? <p className="mt-2 flex items-center gap-1 text-xs text-ink-400"><Check size={12} /> Saving...</p> : null}
    </Card>
  );
}
