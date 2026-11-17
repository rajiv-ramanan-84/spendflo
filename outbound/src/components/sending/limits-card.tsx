"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Minus, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SaveBar, toast } from "@/components/settings/kit";
import { domainFix, domainHealth } from "@/lib/sending/rules";
import { cn } from "@/lib/cn";

type Cfg = { perAddressMax: number; warnAt: number; protectCore: "off" | "warn" | "block"; coreDomains: string[]; warmupEnabled: boolean; bouncePausePct: number; bounceMinSample: number; optoutLine: string | null };
export type DomainRow = { domain: string; kind: "core" | "outreach"; spf: string | null; dkim: string | null; dmarc: string | null; checkedAt: string | null };

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm disabled:bg-canvas";

async function put(body: unknown) {
  return fetch("/api/sending/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network problem" }));
}

/** The three numbers and one rule that matter, up front. Everything else sits under "More protection". */
export function LimitsCard({ cfg, canEdit, armed }: { cfg: Cfg; canEdit: boolean; armed: boolean }) {
  const router = useRouter();
  const [base, setBase] = useState(cfg);
  const [v, setV] = useState(cfg);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [domainsText, setDomainsText] = useState(cfg.coreDomains.join(", "));

  const dirty = JSON.stringify(v) !== JSON.stringify(base);
  const set = <K extends keyof Cfg>(k: K, val: Cfg[K]) => setV((x) => ({ ...x, [k]: val }));
  const num = (s: string) => (s === "" ? 0 : Math.max(0, Math.floor(Number(s) || 0)));

  async function save() {
    if (v.warnAt > v.perAddressMax) return setErr(`The warning level (${v.warnAt}) cannot be above the daily maximum (${v.perAddressMax}).`);
    setBusy(true); setErr(null);
    const r = await put({ perAddressMax: v.perAddressMax, warnAt: v.warnAt, protectCore: v.protectCore, coreDomains: v.coreDomains, warmupEnabled: v.warmupEnabled, bouncePausePct: v.bouncePausePct, bounceMinSample: v.bounceMinSample, optoutLine: v.optoutLine?.trim() || null });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setBase(v); toast("Sending limits saved. They apply to the next email."); router.refresh();
  }

  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-[15px] font-semibold">Sending limits</h2>
      <p className="mt-0.5 max-w-2xl text-sm text-ink-500">Protects your domains. The limit is per address, per day (IST). People see a quiet meter on Today that turns amber past the warning level and stops at the maximum.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="grid gap-1.5 text-sm"><span className="font-medium">Warn when over</span>
          <input type="number" min={1} max={500} className={input} disabled={!canEdit} value={v.warnAt || ""} onChange={(e) => set("warnAt", num(e.target.value))} />
          <span className="text-xs text-ink-500">Emails from one address in a day</span></label>
        <label className="grid gap-1.5 text-sm"><span className="font-medium">Daily maximum</span>
          <input type="number" min={1} max={500} className={input} disabled={!canEdit} value={v.perAddressMax || ""} onChange={(e) => set("perAddressMax", num(e.target.value))} />
          <span className="text-xs text-ink-500">Sending stops here. Admins can override one send.</span></label>
        <div className="grid gap-1.5 text-sm"><span className="font-medium">First emails from the company domain</span>
          <div className="inline-flex w-fit overflow-hidden rounded-xl border border-line text-sm" role="radiogroup" aria-label="First emails from the company domain">
            {(["block", "warn", "off"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={v.protectCore === m} disabled={!canEdit} onClick={() => set("protectCore", m)} className={cn("px-3 py-2 capitalize", v.protectCore === m ? "bg-ink-900 text-white" : "bg-white text-ink-700 hover:bg-canvas")}>{m === "off" ? "Allow" : m === "warn" ? "Warn" : "Block"}</button>
            ))}
          </div>
          <span className="text-xs text-ink-500">{v.protectCore === "off" ? "Cold emails may go from any inbox." : armed ? "Cold first emails must go from an outreach inbox." : "Takes effect once an outreach inbox is connected."}</span></div>
      </div>

      <details className="group mt-5 rounded-xl border border-line">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">More protection</summary>
        <div className="grid gap-4 border-t border-line p-4 md:grid-cols-2">
          <label className="flex items-start gap-2.5 text-sm md:col-span-2"><input type="checkbox" className="mt-0.5" disabled={!canEdit} checked={v.warmupEnabled} onChange={(e) => set("warmupEnabled", e.target.checked)} />
            <span><span className="font-medium">Warm up new inboxes</span><span className="block text-xs text-ink-500">A new outreach inbox sends 10 a day in week one and 20 in week two, then the full maximum.</span></span></label>
          <label className="grid gap-1.5 text-sm"><span className="font-medium">Pause an inbox at this bounce rate (%)</span>
            <input type="number" step="0.5" min={0.5} max={100} className={input} disabled={!canEdit} value={v.bouncePausePct || ""} onChange={(e) => set("bouncePausePct", Number(e.target.value) || 0)} />
            <span className="text-xs text-ink-500">Over the last 14 days.</span></label>
          <label className="grid gap-1.5 text-sm"><span className="font-medium">Only once it has sent at least</span>
            <input type="number" min={5} max={1000} className={input} disabled={!canEdit} value={v.bounceMinSample || ""} onChange={(e) => set("bounceMinSample", num(e.target.value))} />
            <span className="text-xs text-ink-500">Emails, so two bounces out of five do not pause it.</span></label>
          <label className="grid gap-1.5 text-sm md:col-span-2"><span className="font-medium">Other company domains</span>
            <input className={input} disabled={!canEdit} placeholder="Your login domains already count. Add others, comma separated" value={domainsText} onChange={(e) => { setDomainsText(e.target.value); set("coreDomains", e.target.value.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)); }} /></label>
          <label className="grid gap-1.5 text-sm md:col-span-2"><span className="font-medium">Opt-out line on cold first emails</span>
            <input className={input} disabled={!canEdit} maxLength={300} placeholder="Optional, for example: Not relevant? Reply 'no' and I will not follow up." value={v.optoutLine ?? ""} onChange={(e) => set("optoutLine", e.target.value)} /></label>
        </div>
      </details>
      {!canEdit ? <p className="mt-3 text-xs text-ink-400">Only admins can change these.</p> : null}
      <SaveBar dirty={dirty} busy={busy} error={err} onSave={save} onDiscard={() => { setV(base); setDomainsText(base.coreDomains.join(", ")); setErr(null); }} />
    </Card>
  );
}

const DNS = {
  pass: { icon: Check, cls: "text-emerald-600", word: "OK" },
  weak: { icon: CircleAlert, cls: "text-amber-600", word: "Weak" },
  missing: { icon: Minus, cls: "text-rose-600", word: "Missing" },
} as const;

function Dns({ label, s }: { label: string; s: string | null }) {
  if (!s) return <span className="text-xs text-ink-400">{label} ?</span>;
  const d = DNS[s as keyof typeof DNS] ?? DNS.missing;
  const Icon = d.icon;
  return <span className={cn("inline-flex items-center gap-1 text-xs font-medium", d.cls)}><Icon size={13} /> {label} {d.word}</span>;
}

/** Each domain mail goes out from, and whether it is set up to be trusted. */
export function DomainsCard({ domains, canCheck }: { domains: DomainRow[]; canCheck: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function recheck() {
    setBusy(true);
    const r = await fetch("/api/sending/domains", { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false, error: "Network problem" }));
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    toast(`Checked ${r.checked} domain${r.checked === 1 ? "" : "s"}.`); router.refresh();
  }
  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Sending domains</h2>
          <p className="mt-0.5 text-sm text-ink-500">Cold email goes from outreach domains, never the company one. Each needs SPF, DKIM and DMARC.</p>
        </div>
        {canCheck ? <button onClick={recheck} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:border-brand-200 disabled:opacity-50"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Re-check now</button> : null}
      </div>
      {domains.length ? (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {domains.map((d) => {
            const health = domainHealth(d);
            const fix = domainFix(d);
            return (
              <li key={d.domain} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="font-medium">{d.domain}</span><span className={cn("ml-2 rounded-full px-2 py-0.5 text-xs", d.kind === "core" ? "bg-canvas text-ink-700" : "bg-brand-50 text-brand-700")}>{d.kind === "core" ? "Company domain" : "Outreach"}</span></span>
                  <span className="flex flex-wrap items-center gap-3"><Dns label="SPF" s={d.spf} /><Dns label="DKIM" s={d.dkim} /><Dns label="DMARC" s={d.dmarc} /></span>
                </div>
                {health === "fix" ? <ul className="mt-1.5 list-disc pl-5 text-xs text-ink-500">{fix.map((f) => <li key={f}>{f}</li>)}</ul> : health === "unchecked" ? <p className="mt-1 text-xs text-ink-400">Not checked yet. Press Re-check now.</p> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-ink-500">No domains yet. They appear here when an inbox is connected.</p>}
    </Card>
  );
}
