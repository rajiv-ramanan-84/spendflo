"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { SaveBar, toast } from "@/components/settings/kit";

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm";

async function call(url: string, method: string, body: unknown) {
  return fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Network problem" }));
}

/** The settings a person owns: their Slack ID, their voice and signature, and a way into the mailboxes they run. */
export function MySettings({ meId, slackUserId, voice, signature, mailboxes }: { meId: string; slackUserId: string; voice: string; signature: string; mailboxes: Array<{ id: string; email: string; writesAs: string }> }) {
  const router = useRouter();
  const [slack, setSlack] = useState(slackUserId);
  const [slackBase, setSlackBase] = useState(slackUserId);
  const [v, setV] = useState({ voice, signature });
  const [vBase, setVBase] = useState({ voice, signature });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ slack: string | null; voice: string | null }>({ slack: null, voice: null });

  async function saveSlack() {
    setBusy("slack"); setErr((e) => ({ ...e, slack: null }));
    const r = await call("/api/me/slack", "PATCH", { slackUserId: slack.trim() });
    setBusy(null);
    if (!r.ok) return setErr((e) => ({ ...e, slack: r.error }));
    setSlackBase(slack.trim()); toast("Slack ID saved. Alerts will @mention you."); router.refresh();
  }
  async function saveVoice() {
    setBusy("voice"); setErr((e) => ({ ...e, voice: null }));
    const r = await call("/api/settings/writing", "PUT", { scope: "sender", key: meId, instructions: v.voice, signature: v.signature });
    setBusy(null);
    if (!r.ok) return setErr((e) => ({ ...e, voice: r.error }));
    setVBase({ ...v }); toast(`Saved as version ${r.versionNo}. Your next draft uses it.`); router.refresh();
  }

  return (
    <>
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">Slack</h2>
        <p className="mt-0.5 text-sm text-ink-500">So the morning plan and reply alerts @mention you. In Slack: your profile, the three dots, Copy member ID.</p>
        <label className="mt-3 grid max-w-xs gap-1.5 text-sm"><span className="font-medium">Your Slack member ID</span><input className={input} value={slack} placeholder="U0123ABCD" onChange={(e) => setSlack(e.target.value.trim())} /></label>
        <SaveBar dirty={slack !== slackBase} busy={busy === "slack"} error={err.slack} onSave={saveSlack} onDiscard={() => { setSlack(slackBase); setErr((e) => ({ ...e, slack: null })); }} />
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">Your voice and signature</h2>
        <p className="mt-0.5 text-sm text-ink-500">Claude writes in your voice. Your signature is added to the bottom of every email you send as yourself, and Claude never writes it.</p>
        <label className="mt-3 block text-sm font-medium" htmlFor="my-voice">Voice</label>
        <textarea id="my-voice" rows={6} value={v.voice} onChange={(e) => setV({ ...v, voice: e.target.value })} placeholder="How you sound. Leave empty to use the team rules alone." className="mt-1.5 w-full resize-y rounded-xl border border-line bg-canvas p-3 text-sm leading-relaxed focus:border-brand-300 focus:bg-white focus:outline-none" />
        <label className="mt-3 block text-sm font-medium" htmlFor="my-sig">Signature</label>
        <textarea id="my-sig" rows={3} value={v.signature} onChange={(e) => setV({ ...v, signature: e.target.value })} className="mt-1.5 w-full max-w-md resize-y rounded-xl border border-line bg-canvas p-3 text-sm focus:border-brand-300 focus:bg-white focus:outline-none" />
        <SaveBar dirty={v.voice !== vBase.voice || v.signature !== vBase.signature} busy={busy === "voice"} error={err.voice} onSave={saveVoice} onDiscard={() => { setV({ ...vBase }); setErr((e) => ({ ...e, voice: null })); }} />
      </Card>

      {mailboxes.length ? (
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Mailboxes you run</h2>
          <p className="mt-0.5 text-sm text-ink-500">Each mailbox has its own voice and signature, separate from the person it is written as.</p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {mailboxes.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span><span className="font-medium">{m.email}</span><span className="text-ink-500"> · written as {m.writesAs}</span></span>
                <Link href={`/settings/writing/rules?tab=mailbox&mailbox=${m.id}`} className="font-medium text-brand-700 hover:underline">Edit voice and signature</Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
