"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { WritingRules } from "@/lib/writing/compose";
import { isFounderSignature } from "@/lib/playbook/founder";
import { ValidationEditor } from "@/components/settings/validation-editor";

type Hist = Array<{ versionNo: number; instructions: string; signature: string; editedBy: string | null; createdAt: string }>;
type Props = {
  rules: WritingRules;
  personas: Array<{ key: string; label: string }>;
  senders: Array<{ id: string; name: string }>;
  history: Record<string, Hist>;
  canEdit: boolean;
};
type Tab = "team" | "persona" | "sender" | "founder";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const HINT: Record<Tab, string> = {
  team: "Voice, subject lines, what makes an email worth reading. Applies to every email.",
  persona: "How to write to this kind of person. For example: lead with spend under control, never mention features.",
  sender: "How this person sounds. Leave the voice empty to use the team rules alone.",
  founder: "",
};

export function WritingSettings(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("team");
  const [persona, setPersona] = useState(p.personas[0].key);
  const [sender, setSender] = useState(p.senders[0]?.id ?? "");
  const key = tab === "team" ? "team" : tab === "persona" ? persona : sender;
  const saved = tab === "team" ? { text: p.rules.team, sig: "" } : tab === "persona" ? { text: p.rules.personas[persona] ?? "", sig: "" } : { text: p.rules.senders[sender]?.voice ?? "", sig: p.rules.senders[sender]?.signature ?? "" };
  const [draft, setDraft] = useState<Record<string, { text: string; sig: string }>>({});
  const id = `${tab}|${key}`;
  const cur = draft[id] ?? saved;
  const dirty = cur.text !== saved.text || cur.sig !== saved.sig;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hist = p.history[id] ?? [];
  const founders = p.senders.filter((u) => isFounderSignature(p.rules.senders[u.id]?.signature)).map((u) => u.name);

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/settings/writing", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: tab, key, instructions: cur.text, signature: tab === "sender" ? cur.sig : null }) });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) return setMsg({ ok: false, text: d.error });
    setDraft((x) => { const n = { ...x }; delete n[id]; return n; });
    setMsg({ ok: true, text: `Saved as version ${d.versionNo}. The next draft uses it.` });
    router.refresh();
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2"><PenLine size={18} className="text-brand-500" /><h2 className="text-lg font-semibold">Writing rules</h2></div>
      <p className="mt-1 max-w-2xl text-sm text-ink-500">Standing instructions Claude follows when it writes. Narrower wins: a persona rule refines the team rule, and the sender&apos;s voice sets the tone.</p>

      <div className="mt-4 inline-flex rounded-xl bg-canvas p-1" role="tablist">
        {([["team", "Team"], ["persona", "By persona"], ["sender", "By sender"], ["founder", "Founder outreach"]] as const).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setMsg(null); }} className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors", tab === t ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900")}>{label}</button>
        ))}
      </div>

      {tab === "founder" ? <ValidationEditor personas={p.personas} custom={p.rules.hypotheses} smallGroup={p.rules.validation.smallGroup} founders={founders} canEdit={p.canEdit} /> : (
        <>
      {tab !== "team" ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(tab === "persona" ? p.personas.map((x) => ({ id: x.key, label: x.label, on: !!p.rules.personas[x.key]?.trim() })) : p.senders.map((x) => ({ id: x.id, label: x.name, on: !!p.rules.senders[x.id]?.voice.trim() }))).map((o) => (
            <button key={o.id} onClick={() => { if (tab === "persona") setPersona(o.id); else setSender(o.id); setMsg(null); }} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors", key === o.id ? "border-ink-900 bg-ink-900 text-white" : "border-line text-ink-700 hover:bg-canvas")}>
              {o.label}{o.on ? <span className={cn("size-1.5 rounded-full", key === o.id ? "bg-white" : "bg-emerald-500")} aria-label="has instructions" /> : null}
            </button>
          ))}
        </div>
      ) : null}

      <label className="mt-4 block text-sm font-medium text-ink-900" htmlFor="wr-text">{tab === "sender" ? "Voice" : "Instructions"}</label>
      <p className="text-xs text-ink-500">{HINT[tab]}</p>
      <textarea id="wr-text" value={cur.text} disabled={!p.canEdit} onChange={(e) => setDraft((x) => ({ ...x, [id]: { ...cur, text: e.target.value } }))} rows={tab === "team" ? 16 : 7} className="mt-1.5 w-full resize-y rounded-xl border border-line bg-canvas p-3 text-sm leading-relaxed focus:border-brand-300 focus:bg-white focus:outline-none disabled:opacity-60" />

      {tab === "sender" ? (
        <>
          <label className="mt-3 block text-sm font-medium text-ink-900" htmlFor="wr-sig">Signature</label>
          <p className="text-xs text-ink-500">Added at the bottom of every email this person sends. Claude never writes it.</p>
          <textarea id="wr-sig" value={cur.sig} disabled={!p.canEdit} onChange={(e) => setDraft((x) => ({ ...x, [id]: { ...cur, sig: e.target.value } }))} rows={3} className="mt-1.5 w-full max-w-md resize-y rounded-xl border border-line bg-canvas p-3 text-sm focus:border-brand-300 focus:bg-white focus:outline-none disabled:opacity-60" />
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {p.canEdit ? <Button onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</Button> : <span className="text-sm text-ink-500">Only admins can edit.</span>}
        {dirty ? <button className="text-sm text-ink-500 hover:text-ink-900" onClick={() => setDraft((x) => { const n = { ...x }; delete n[id]; return n; })}>Discard changes</button> : null}
        {hist[0] ? <span className="ml-auto text-xs text-ink-400">Version {hist[0].versionNo}{hist[0].editedBy ? `, ${hist[0].editedBy}` : ""}, {when(hist[0].createdAt)}</span> : <span className="ml-auto text-xs text-ink-400">Not set yet</span>}
      </div>
      {msg ? <div role="status" className={cn("mt-2 rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-brand-50 text-brand-700")}>{msg.text}</div> : null}

      {hist.length > 1 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-500 hover:text-ink-900">Earlier versions</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {hist.slice(1).map((h) => (
              <li key={h.versionNo} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-canvas">
                <span className="text-ink-700">Version {h.versionNo}<span className="text-ink-400">{h.editedBy ? ` · ${h.editedBy}` : ""} · {when(h.createdAt)}</span></span>
                {p.canEdit ? <button className="text-brand-700 hover:underline" onClick={() => setDraft((x) => ({ ...x, [id]: { text: h.instructions, sig: h.signature } }))}>Restore to editor</button> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
        </>
      )}
    </Card>
  );
}
