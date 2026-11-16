"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { IntegrationRow, ToolRow } from "@/lib/agent/integrations";

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm disabled:bg-canvas";
const LEVELS = [["read", "Read"], ["approve", "Needs approval"], ["blocked", "Blocked"]] as const;
const CHIP: Record<string, string> = { ok: "bg-emerald-50 text-emerald-700", error: "bg-rose-50 text-rose-700", untested: "bg-amber-50 text-amber-800" };

async function call(url: string, method: string, body?: unknown) {
  return fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Network problem" }));
}

function Tool({ t, canEdit, onDone }: { t: ToolRow; canEdit: boolean; onDone: (m: string | null) => void }) {
  const [level, setLevel] = useState(t.level);
  const [credits, setCredits] = useState(String(t.credits_estimate));
  const [saved, setSaved] = useState(!t.needs_review);
  async function save(l: typeof level, c: string) {
    const r = await call(`/api/integrations/tools/${t.id}`, "PATCH", { level: l, credits: Number(c) || 0 });
    if (r.ok) { setSaved(true); onDone(null); } else onDone(r.error);
  }
  return (
    <tr className="align-top">
      <td className="py-2 pr-3"><div className="font-mono text-xs">{t.name}</div>{t.description ? <div className="mt-0.5 line-clamp-2 max-w-md text-xs text-ink-500">{t.description}</div> : null}</td>
      <td className="py-2 pr-3">
        <select className={`${input} !w-40`} disabled={!canEdit} value={level} onChange={(e) => { const l = e.target.value as typeof level; setLevel(l); void save(l, credits); }}>
          {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </td>
      <td className="py-2 pr-3"><input className={`${input} !w-20`} type="number" min={0} disabled={!canEdit || level === "blocked"} value={credits} onChange={(e) => setCredits(e.target.value)} onBlur={() => void save(level, credits)} aria-label="Credits per call" /></td>
      <td className="py-2 text-xs">{saved ? <span className="text-emerald-700">Reviewed</span> : <button disabled={!canEdit} onClick={() => void save(level, credits)} className="rounded-lg bg-amber-100 px-2 py-1 font-medium text-amber-900 hover:bg-amber-200">Confirm to use</button>}</td>
    </tr>
  );
}

export function IntegrationsSettings({ integrations, tools, canEdit }: { integrations: IntegrationRow[]; tools: ToolRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ preset: "tapistro", name: "Tapistro", url: "", token: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<Record<string, string>>({});

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; result?: { tools: number; added: number; changed: number } }>, ok: string) {
    setBusy(key); setMsg(null);
    const r = await fn();
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: r.result ? `Connected. ${r.result.tools} tools found${r.result.added ? `, ${r.result.added} new` : ""}${r.result.changed ? `, ${r.result.changed} changed (blocked until you review them)` : ""}.` : ok } : { ok: false, text: r.error ?? "Something went wrong" });
    if (r.ok) router.refresh();
  }

  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-lg font-semibold">Integrations</h2>
      <p className="mt-0.5 max-w-2xl text-sm text-ink-500">Tools the assistant may use, such as Tapistro. Each starts switched off. Test the connection, review every tool, then switch it on. A tool the server later changes is blocked again until you look at it. Only remote https servers work.</p>

      <div className="mt-5 grid gap-4">
        {integrations.length === 0 ? <p className="text-sm text-ink-500">No integrations yet.</p> : null}
        {integrations.map((i) => {
          const mine = tools.filter((t) => t.integration_id === i.id);
          const pending = mine.filter((t) => t.needs_review).length;
          const exp = open === i.id;
          return (
            <div key={i.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{i.name}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[i.status] ?? CHIP.untested}`}>{i.status === "ok" ? "Connected" : i.status === "error" ? "Failed" : "Not tested"}</span>{pending ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{pending} to review</span> : null}</div>
                  <div className="mt-0.5 truncate text-xs text-ink-400">{i.url}{i.hasToken ? " · token saved" : ""}</div>
                  {i.last_error ? <div className="mt-1 text-xs text-rose-600">{i.last_error}</div> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4" checked={i.enabled} disabled={!canEdit || busy === i.id} onChange={(e) => void run(i.id, () => call(`/api/integrations/${i.id}`, "PATCH", { enabled: e.target.checked }), e.target.checked ? "Switched on." : "Switched off.")} /> On</label>
                  <Button variant="secondary" disabled={!canEdit || busy === i.id} onClick={() => void run(i.id, () => call(`/api/integrations/${i.id}/test`, "POST"), "Tested.")}>{busy === i.id ? "Working..." : "Test connection"}</Button>
                  <button className="text-sm text-ink-500 hover:text-ink-900" onClick={() => setOpen(exp ? null : i.id)}>{exp ? "Hide tools" : `Tools (${mine.length})`}</button>
                </div>
              </div>
              {exp ? (
                <div className="mt-4">
                  {mine.length === 0 ? <p className="text-sm text-ink-500">Test the connection to load the tools.</p> : (
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-ink-400"><tr><th className="pb-1 font-medium">Tool</th><th className="pb-1 font-medium">Allowed</th><th className="pb-1 font-medium">Credits per call</th><th className="pb-1 font-medium">Status</th></tr></thead>
                      <tbody className="divide-y divide-line">{mine.map((t) => <Tool key={t.id + t.level + String(t.needs_review)} t={t} canEdit={canEdit} onDone={(m) => { if (m) setMsg({ ok: false, text: m }); else router.refresh(); }} />)}</tbody>
                    </table>
                  )}
                  {canEdit ? (
                    <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                      <label className="grid gap-1 text-xs"><span className="font-medium">Replace the token</span><input className={`${input} !w-64`} type="password" placeholder="Paste a new token" value={newToken[i.id] ?? ""} onChange={(e) => setNewToken((s) => ({ ...s, [i.id]: e.target.value }))} /></label>
                      <Button variant="secondary" disabled={!newToken[i.id]} onClick={() => void run(i.id, () => call(`/api/integrations/${i.id}`, "PATCH", { token: newToken[i.id] }), "Token saved. Test the connection again.")}>Save token</Button>
                      <button className="text-sm text-rose-600 hover:underline" onClick={() => { if (confirm(`Remove ${i.name}?`)) void run(i.id, () => call(`/api/integrations/${i.id}`, "DELETE"), "Removed."); }}>Remove</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {canEdit ? (
        <div className="mt-6 rounded-xl border border-dashed border-line p-4">
          <h3 className="text-sm font-semibold">Add an integration</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="grid gap-1 text-xs"><span className="font-medium">Type</span>
              <select className={input} value={form.preset} onChange={(e) => setForm((f) => ({ ...f, preset: e.target.value, name: e.target.value === "tapistro" ? "Tapistro" : "" }))}><option value="tapistro">Tapistro</option><option value="custom">Custom MCP server</option></select></label>
            <label className="grid gap-1 text-xs"><span className="font-medium">Name</span><input className={input} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
            <label className="grid gap-1 text-xs md:col-span-2"><span className="font-medium">Server address (https)</span><input className={input} placeholder="https://..." value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} /></label>
            <label className="grid gap-1 text-xs md:col-span-3"><span className="font-medium">Token</span><input className={input} type="password" placeholder="Stored encrypted. Never shown again." value={form.token} onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))} /></label>
            <div className="flex items-end"><Button disabled={busy === "add" || !form.name || !form.url} onClick={() => void run("add", async () => { const r = await call("/api/integrations", "POST", { name: form.name, url: form.url, token: form.token || null, preset: form.preset }); if (r.ok) setForm({ preset: "tapistro", name: "Tapistro", url: "", token: "" }); return r; }, "Added. Now test the connection.")}>Add</Button></div>
          </div>
        </div>
      ) : null}
      {msg ? <p className={`mt-4 text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p> : null}
    </Card>
  );
}
