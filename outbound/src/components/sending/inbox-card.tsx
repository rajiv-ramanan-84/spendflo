"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Pause, Play, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/settings/kit";
import { InboxLine, type InboxView } from "./ui";

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm";

async function api(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network problem" }));
}

/**
 * Your sending inboxes: today's use for each, and a way to connect another one. Anyone on the team can connect an inbox
 * that writes as them. It starts in warm-up so a new address builds a reputation before it carries a full day.
 */
export function InboxCard({ inboxes, canResume, flash }: { inboxes: InboxView[]; canResume: boolean; flash: { ok: boolean; text: string } | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(flash && !flash.ok ? flash.text : null);
  const [adding, setAdding] = useState(false);

  async function connect() {
    setBusy("add"); setErr(null);
    const r = await api("/api/mailboxes", { email: email.trim() });
    if (!r.ok) { setBusy(null); return setErr(r.error); }
    // Straight on to Google's consent for that inbox.
    window.location.href = `/api/mailboxes/connect?mailbox=${r.mailboxId}`;
  }
  async function pause(i: InboxView, paused: boolean) {
    setBusy(i.key);
    const r = await api(`/api/mailboxes/${i.mailboxId}/pause`, { paused });
    setBusy(null);
    if (!r.ok) return toast(r.error, "error");
    toast(paused ? `${i.email} is paused. Nothing will be drafted from it.` : `${i.email} is back in use.`); router.refresh();
  }

  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold">Your sending inboxes</h2>
      <p className="mt-0.5 text-sm text-ink-500">Where your emails can go from, and how much of today each has used. First emails to new people should go from an outreach inbox, not your company address.</p>
      {flash?.ok ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{flash.text}</p> : null}

      <ul className="mt-4 grid gap-4">
        {inboxes.map((i) => (
          <li key={i.key} className="rounded-xl border border-line p-3.5">
            <InboxLine i={i} actions={i.mailboxId ? (
              <span className="flex items-center gap-1">
                {!i.connected ? <a href={`/api/mailboxes/connect?mailbox=${i.mailboxId}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-canvas"><Link2 size={13} /> Reconnect</a> : null}
                {i.paused ? (canResume ? <button disabled={busy === i.key} onClick={() => pause(i, false)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-canvas"><Play size={13} /> Resume</button> : null)
                  : <button disabled={busy === i.key} onClick={() => pause(i, true)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-500 hover:bg-canvas"><Pause size={13} /> Pause</button>}
                <Link href={`/settings/writing/rules?tab=mailbox&mailbox=${i.mailboxId}`} className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-canvas">Voice</Link>
              </span>
            ) : null} />
            {i.paused && i.pausedReason ? <p className="mt-1.5 text-xs text-rose-700">{i.pausedReason}</p> : null}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-4 rounded-xl border border-dashed border-line p-4">
          <label className="grid gap-1.5 text-sm"><span className="font-medium">Inbox address</span>
            <input className={input} type="email" autoFocus placeholder="you@your-outreach-domain.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} onKeyDown={(e) => e.key === "Enter" && email.includes("@") && connect()} />
          </label>
          {err ? <p className="mt-2 text-sm text-rose-700">{err}</p> : null}
          <ul className="mt-3 list-disc pl-5 text-xs text-ink-500">
            <li>Use an address on an outreach domain. Personal inboxes (Gmail, Outlook) are not allowed.</li>
            <li>It writes as you. To write as someone else, ask an admin.</li>
            <li>A new inbox warms up: 10 a day in week one, 20 in week two, then the full limit.</li>
            <li>Google will ask you to sign in to that inbox once.</li>
          </ul>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button onClick={() => { setAdding(false); setErr(null); }} className="rounded-lg px-3 py-1.5 text-sm text-ink-500 hover:bg-canvas">Cancel</button>
            <Button disabled={busy !== null || !email.includes("@")} onClick={connect}>{busy === "add" ? "Connecting..." : <><Link2 size={15} /> Connect</>}</Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium hover:border-brand-200"><Plus size={15} /> Connect another inbox</button>
      )}
      {!adding && err ? <p className="mt-2 text-sm text-rose-700">{err}</p> : null}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer select-none text-ink-500 hover:text-ink-900">Setting up a new outreach domain</summary>
        <ol className="mt-2 list-decimal pl-5 text-xs leading-relaxed text-ink-700">
          <li>Buy a look-alike domain, for example a .com close to your brand. Not a subdomain of the company one.</li>
          <li>Add 2 to 3 Google Workspace inboxes on it. Keep each under {inboxes[0]?.max ?? 30} emails a day.</li>
          <li>Publish SPF, DKIM and DMARC for the domain. An admin can check them under Mailboxes, Sending domains.</li>
          <li>Point the domain at the website so it looks real, then connect the inboxes here.</li>
        </ol>
      </details>
    </Card>
  );
}
