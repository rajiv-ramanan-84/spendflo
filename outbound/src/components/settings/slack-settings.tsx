"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  channelId: string;
  envChannel: boolean;
  connected: boolean;
  morningTime: string;
  enabled: { morning: boolean; reply_alert: boolean };
  users: Array<{ id: string; name: string; email: string; slackUserId: string }>;
  canEdit: boolean;
};

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm disabled:bg-canvas";

export function SlackSettings(p: Props) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(p.channelId);
  const [morningTime, setMorningTime] = useState(p.morningTime);
  const [enabled, setEnabled] = useState(p.enabled);
  const [handles, setHandles] = useState(Object.fromEntries(p.users.map((u) => [u.id, u.slackUserId])));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(kind: "save" | "test") {
    setBusy(kind);
    setMsg(null);
    const res = kind === "save"
      ? await fetch("/api/settings/slack", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelId, morningTime, enabled, handles: Object.entries(handles).map(([userId, slackUserId]) => ({ userId, slackUserId })) }) })
      : await fetch("/api/settings/slack/test", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    setMsg(data.ok ? { ok: true, text: kind === "save" ? "Saved." : "Test post sent. Check the channel." } : { ok: false, text: data.error });
    if (data.ok) router.refresh();
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Slack</h2>
          <p className="mt-0.5 text-sm text-ink-500">One shared channel. Morning plan threaded per person, reply alerts with an @mention.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${p.connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {p.connected ? "Bot token set" : "Bot token missing"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Channel ID</span>
          <input className={input} value={channelId} disabled={!p.canEdit} onChange={(e) => setChannelId(e.target.value.trim())} placeholder={p.envChannel ? "Using SLACK_CHANNEL_ID" : "C0123ABCD"} />
          <span className="text-xs text-ink-400">#outbound-command. Invite the bot to it first.</span>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Morning plan (IST)</span>
          <input type="time" className={input} value={morningTime} disabled={!p.canEdit} onChange={(e) => setMorningTime(e.target.value)} />
          <span className="text-xs text-ink-400">Working days only. Skips US holidays.</span>
        </label>
        <div className="grid gap-2 text-sm">
          <span className="font-medium">Posts</span>
          {([["morning", "Morning plan"], ["reply_alert", "Reply alerts"]] as const).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-2">
              <input type="checkbox" className="accent-brand-500" checked={enabled[k]} disabled={!p.canEdit} onChange={(e) => setEnabled((x) => ({ ...x, [k]: e.target.checked }))} /> {label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm font-medium">@mentions</div>
        <p className="text-xs text-ink-400">Slack member ID per teammate: their profile, the three dots, Copy member ID.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {p.users.map((u) => (
            <label key={u.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="truncate"><span className="font-medium">{u.name}</span> <span className="text-ink-400">{u.email}</span></span>
              <input className={input} value={handles[u.id] ?? ""} disabled={!p.canEdit} placeholder="U0123ABCD" onChange={(e) => setHandles((h) => ({ ...h, [u.id]: e.target.value.trim() }))} />
            </label>
          ))}
        </div>
      </div>

      {msg && <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
      {p.canEdit ? (
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={!!busy} onClick={() => call("test")}><Send size={16} /> {busy === "test" ? "Sending..." : "Send test post"}</Button>
          <Button disabled={!!busy} onClick={() => call("save")}><Check size={16} /> {busy === "save" ? "Saving..." : "Save"}</Button>
        </div>
      ) : <p className="mt-4 text-xs text-ink-400">Admins can change these.</p>}
    </Card>
  );
}
