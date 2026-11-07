"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Pause, PartyPopper, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The account at a glance once a campaign is live. A positive reply turns it
 * into a green banner nobody can miss: who said yes, what they said, which
 * tracks are paused, and the next move. Otherwise a slim bar to pause or resume.
 */
type Props = {
  campaignId: string;
  status: string;
  canEdit: boolean;
  positive: { contactId: string | null; who: string; when: string; summary: string | null } | null;
  paused: Array<{ name: string; reason: string | null }>;
  running: number;
};

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return res.json().catch(() => ({ ok: false, error: "No response" }));
}

export function CampaignStatusBar(p: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, url: string, body?: unknown) {
    setBusy(key);
    setError(null);
    const r = await post(url, body);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }
  const pauseAll = () => {
    const reason = window.prompt("Why pause? (e.g. positive reply, meeting booked, on hold)", p.positive ? "Positive reply" : "On hold");
    if (reason !== null) void run("pause", `/api/campaigns/${p.campaignId}/pause`, { reason, exceptContactId: p.positive?.contactId ?? null });
  };
  const met = p.status === "meeting_booked";

  if (p.positive || met) {
    return (
      <div className="rounded-[var(--radius-card)] border-2 border-emerald-300 bg-emerald-50 p-5 shadow-[var(--shadow-soft)] md:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white">{met ? <CalendarCheck size={20} /> : <PartyPopper size={20} />}</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{met ? "Meeting booked" : "Positive reply"}</div>
            <div className="mt-0.5 text-lg font-semibold text-ink-900">{p.positive ? `${p.positive.who} replied, ${p.positive.when}` : "This account has a meeting booked"}</div>
            {p.positive?.summary ? <p className="mt-1 text-sm text-ink-700">{p.positive.summary}</p> : null}
            <p className="mt-2 text-sm text-ink-600">
              {p.paused.length
                ? <>Other tracks: <b>{p.paused.length} paused</b> ({p.paused.map((x) => x.name).join(", ")}).</>
                : p.running ? <>Other tracks: <b>{p.running} still running</b>. Pause them while you work this reply?</> : "No other tracks running."}
            </p>
          </div>
        </div>
        {p.canEdit ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {!met ? <Button onClick={() => document.getElementById("responses")?.scrollIntoView({ behavior: "smooth" })}><Sparkles size={16} /> Re-plan around the meeting</Button> : null}
            {!met ? <Button variant="secondary" disabled={busy !== null} onClick={() => run("meeting", `/api/campaigns/${p.campaignId}/meeting`, { contactId: p.positive?.contactId ?? null })}><CalendarCheck size={16} /> {busy === "meeting" ? "Saving..." : "Mark meeting booked"}</Button> : null}
            {p.running ? <Button variant="secondary" disabled={busy !== null} onClick={pauseAll}><Pause size={16} /> Pause the others</Button> : null}
            {p.paused.length ? <Button variant="ghost" disabled={busy !== null} onClick={() => run("resume", `/api/campaigns/${p.campaignId}/resume`)}><Play size={16} /> {busy === "resume" ? "Resuming..." : "Resume the others"}</Button> : null}
          </div>
        ) : null}
        {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      </div>
    );
  }

  if (!p.canEdit || (!p.running && !p.paused.length)) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm shadow-[var(--shadow-soft)]">
      <span className="text-ink-600">
        {p.paused.length ? <><b>{p.paused.length} track{p.paused.length > 1 ? "s" : ""} paused</b>{p.paused[0].reason ? ` (${p.paused[0].reason})` : ""}{p.running ? `, ${p.running} running` : ""}.</> : <>{p.running} track{p.running > 1 ? "s" : ""} running.</>}
      </span>
      <span className="flex gap-2">
        {p.running ? <Button variant="secondary" className="px-3 py-1.5" disabled={busy !== null} onClick={pauseAll}><Pause size={14} /> Pause all tracks</Button> : null}
        {p.paused.length ? <Button className="px-3 py-1.5" disabled={busy !== null} onClick={() => run("resume", `/api/campaigns/${p.campaignId}/resume`)}><Play size={14} /> {busy === "resume" ? "Resuming..." : "Resume"}</Button> : null}
      </span>
      {error ? <p className="w-full rounded-xl bg-rose-50 px-3 py-2 text-rose-700">{error}</p> : null}
    </div>
  );
}
