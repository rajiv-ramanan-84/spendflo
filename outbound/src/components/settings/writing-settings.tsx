"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { SaveBar, toast } from "@/components/settings/kit";
import { cn } from "@/lib/cn";
import type { WritingRules } from "@/lib/writing/compose";
import { isFounderSignature } from "@/lib/playbook/founder";
import { ValidationEditor } from "@/components/settings/validation-editor";

type Hist = Array<{ versionNo: number; instructions: string; signature: string; editedBy: string | null; createdAt: string }>;
export type WritingPerm = { team: boolean; allSenders: boolean; senders: string[]; allMailboxes: boolean; mailboxes: string[] };
type Props = {
  rules: WritingRules;
  personas: Array<{ key: string; label: string }>;
  senders: Array<{ id: string; name: string }>;
  mailboxes: Array<{ id: string; email: string; writesAs: string }>;
  history: Record<string, Hist>;
  perm: WritingPerm;
  meId: string | null;
  initialTab?: Tab;
  initialMailbox?: string;
};
type Tab = "team" | "persona" | "sender" | "mailbox" | "founder";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const HINT: Record<Tab, string> = {
  team: "Voice, subject lines, what makes an email worth reading. Applies to every email.",
  persona: "How to write to this kind of person. For example: lead with spend under control, never mention features.",
  sender: "How this person sounds. Leave the voice empty to use the team rules alone.",
  mailbox: "Voice and signature for mail sent from this mailbox. Leave either blank to use the rules of the person the mailbox writes as.",
  founder: "",
};

export function WritingSettings(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(p.initialTab ?? "team");
  const [persona, setPersona] = useState(p.personas[0].key);
  const [sender, setSender] = useState(p.meId && p.senders.some((s) => s.id === p.meId) ? p.meId : (p.senders[0]?.id ?? ""));
  const [mailbox, setMailbox] = useState(p.initialMailbox && p.mailboxes.some((m) => m.id === p.initialMailbox) ? p.initialMailbox : (p.mailboxes.find((m) => p.perm.allMailboxes || p.perm.mailboxes.includes(m.id)) ?? p.mailboxes[0])?.id ?? "");
  const key = tab === "team" ? "team" : tab === "persona" ? persona : tab === "sender" ? sender : mailbox;
  const canEdit = tab === "team" || tab === "persona" || tab === "founder" ? p.perm.team : tab === "sender" ? p.perm.allSenders || p.perm.senders.includes(sender) : p.perm.allMailboxes || p.perm.mailboxes.includes(mailbox);
  const personal = tab === "sender" || tab === "mailbox";
  const saved = tab === "team" ? { text: p.rules.team, sig: "" } : tab === "persona" ? { text: p.rules.personas[persona] ?? "", sig: "" } : tab === "sender" ? { text: p.rules.senders[sender]?.voice ?? "", sig: p.rules.senders[sender]?.signature ?? "" } : { text: p.rules.mailboxes[mailbox]?.voice ?? "", sig: p.rules.mailboxes[mailbox]?.signature ?? "" };
  const [draft, setDraft] = useState<Record<string, { text: string; sig: string }>>({});
  const id = `${tab}|${key}`;
  const cur = draft[id] ?? saved;
  const dirty = cur.text !== saved.text || cur.sig !== saved.sig;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hist = p.history[id] ?? [];
  const founders = p.senders.filter((u) => isFounderSignature(p.rules.senders[u.id]?.signature)).map((u) => u.name);
  const mb = p.mailboxes.find((m) => m.id === mailbox);

  async function save() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/settings/writing", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: tab, key, instructions: cur.text, signature: personal ? cur.sig : null }) });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) return setErr(d.error);
    toast(`Saved as version ${d.versionNo}. The next draft uses it.`);
    router.refresh();
  }
  const discard = () => { setDraft((x) => { const n = { ...x }; delete n[id]; return n; }); setErr(null); };
  const tabs: Array<[Tab, string]> = [["team", "Team"], ["persona", "By persona"], ["sender", "By sender"], ...(p.mailboxes.length ? ([["mailbox", "By mailbox"]] as Array<[Tab, string]>) : []), ["founder", "Founder outreach"]];

  return (
    <Card className="p-5 md:p-6">
      <h2 className="sr-only">Writing rules</h2>
      <p className="max-w-2xl text-sm text-ink-500">Standing instructions Claude follows when it writes. Narrower wins: a mailbox rule refines the sender&apos;s, a persona rule refines the team&apos;s, and the sender&apos;s voice sets the tone.</p>

      <div className="mt-4 inline-flex flex-wrap rounded-xl bg-canvas p-1" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setErr(null); window.history.replaceState(null, "", t === "team" ? "/settings/writing/rules" : `/settings/writing/rules?tab=${t}`); }} className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors", tab === t ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900")}>{label}</button>
        ))}
      </div>

      {tab === "founder" ? <ValidationEditor personas={p.personas} custom={p.rules.hypotheses} smallGroup={p.rules.validation.smallGroup} founders={founders} canEdit={p.perm.team} /> : (
        <>
      {tab !== "team" ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(tab === "persona" ? p.personas.map((x) => ({ id: x.key, label: x.label, on: !!p.rules.personas[x.key]?.trim(), mine: false })) : tab === "sender" ? p.senders.map((x) => ({ id: x.id, label: x.id === p.meId ? `${x.name} (you)` : x.name, on: !!p.rules.senders[x.id]?.voice.trim(), mine: p.perm.allSenders || p.perm.senders.includes(x.id) })) : p.mailboxes.map((x) => ({ id: x.id, label: x.email, on: !!(p.rules.mailboxes[x.id]?.voice.trim() || p.rules.mailboxes[x.id]?.signature.trim()), mine: p.perm.allMailboxes || p.perm.mailboxes.includes(x.id) }))).map((o) => (
            <button key={o.id} onClick={() => { if (tab === "persona") setPersona(o.id); else if (tab === "sender") setSender(o.id); else setMailbox(o.id); setErr(null); }} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors", key === o.id ? "border-ink-900 bg-ink-900 text-white" : "border-line text-ink-700 hover:bg-canvas")}>
              {o.label}{o.on ? <span className={cn("size-1.5 rounded-full", key === o.id ? "bg-white" : "bg-emerald-500")} aria-label="has instructions" /> : null}
            </button>
          ))}
        </div>
      ) : null}
      {tab === "mailbox" && mb ? <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm text-ink-600">Mail sent from <b>{mb.email}</b> is written as <b>{mb.writesAs}</b>. Anything you leave blank here uses {mb.writesAs}&apos;s own rules.</p> : null}

      <label className="mt-4 block text-sm font-medium text-ink-900" htmlFor="wr-text">{personal ? "Voice" : "Instructions"}</label>
      <p className="text-xs text-ink-500">{HINT[tab]}</p>
      <textarea id="wr-text" value={cur.text} disabled={!canEdit} onChange={(e) => setDraft((x) => ({ ...x, [id]: { ...cur, text: e.target.value } }))} rows={tab === "team" ? 16 : 7} className="mt-1.5 w-full resize-y rounded-xl border border-line bg-canvas p-3 text-sm leading-relaxed focus:border-brand-300 focus:bg-white focus:outline-none disabled:opacity-60" />

      {personal ? (
        <>
          <label className="mt-3 block text-sm font-medium text-ink-900" htmlFor="wr-sig">Signature</label>
          <p className="text-xs text-ink-500">Added at the bottom of every email sent {tab === "mailbox" ? "from this mailbox" : "as this person"}. Claude never writes it.</p>
          <textarea id="wr-sig" value={cur.sig} disabled={!canEdit} onChange={(e) => setDraft((x) => ({ ...x, [id]: { ...cur, sig: e.target.value } }))} rows={3} className="mt-1.5 w-full max-w-md resize-y rounded-xl border border-line bg-canvas p-3 text-sm focus:border-brand-300 focus:bg-white focus:outline-none disabled:opacity-60" />
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-400">
        {!canEdit ? <span className="text-sm text-ink-500">{tab === "sender" ? "You can change your own. Admins can change anyone's." : tab === "mailbox" ? "Only admins and the people who run this mailbox can change it." : "Only admins and managers can change this."}</span> : null}
        {hist[0] ? <span className="ml-auto">Version {hist[0].versionNo}{hist[0].editedBy ? `, ${hist[0].editedBy}` : ""}, {when(hist[0].createdAt)}</span> : <span className="ml-auto">Not set yet</span>}
      </div>
      {canEdit ? <SaveBar dirty={dirty} busy={busy} error={err} onSave={save} onDiscard={discard} /> : null}

      {hist.length > 1 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-500 hover:text-ink-900">Earlier versions</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {hist.slice(1).map((h) => (
              <li key={h.versionNo} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-canvas">
                <span className="text-ink-700">Version {h.versionNo}<span className="text-ink-400">{h.editedBy ? ` · ${h.editedBy}` : ""} · {when(h.createdAt)}</span></span>
                {canEdit ? <button className="text-brand-700 hover:underline" onClick={() => setDraft((x) => ({ ...x, [id]: { text: h.instructions, sig: h.signature } }))}>Restore to editor</button> : null}
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
