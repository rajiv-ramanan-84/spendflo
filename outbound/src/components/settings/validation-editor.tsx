"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { PLAY_NAME, PLAY_SHORT, type PlayCode } from "@/lib/playbook/catalog";
import { DEFAULT_HYPOTHESES, type Hypothesis } from "@/lib/playbook/founder";

type Props = {
  personas: Array<{ key: string; label: string }>;
  custom: Record<string, Hypothesis>;
  smallGroup: boolean;
  founders: string[];
  canEdit: boolean;
};

const PLAYS: PlayCode[] = ["A1", "A2", "A3"];
async function put(key: string, instructions: string) {
  const res = await fetch("/api/settings/writing", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "team", key, instructions }) });
  return res.json().catch(() => ({ ok: false, error: "No response" }));
}

/** The line the app writes from for each play and persona, the small-group setting and who gets the founder style. */
export function ValidationEditor(p: Props) {
  const router = useRouter();
  const [play, setPlay] = useState<PlayCode>("A1");
  const [persona, setPersona] = useState(p.personas[1]?.key ?? p.personas[0].key);
  const [group, setGroup] = useState(p.smallGroup);
  const key = `${play}:${persona}`;
  const base = p.custom[key] ?? DEFAULT_HYPOTHESES[key] ?? { guess: "", share: "", subject: "" };
  const [draft, setDraft] = useState<Record<string, Hypothesis>>({});
  const cur = draft[key] ?? base;
  const dirty = !!draft[key] && JSON.stringify(draft[key]) !== JSON.stringify(base);
  const has = (pl: PlayCode, per: string) => !!(p.custom[`${pl}:${per}`] ?? DEFAULT_HYPOTHESES[`${pl}:${per}`]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true); setMsg(null);
    const d = await put(`hypothesis:${key}`, JSON.stringify(cur));
    setBusy(false);
    if (!d.ok) return setMsg({ ok: false, text: d.error });
    setDraft((x) => { const n = { ...x }; delete n[key]; return n; });
    setMsg({ ok: true, text: "Saved. The next draft uses it." });
    router.refresh();
  }
  async function toggle(v: boolean) {
    setGroup(v); setMsg(null);
    const d = await put("validation", JSON.stringify({ smallGroup: v }));
    if (!d.ok) { setGroup(!v); return setMsg({ ok: false, text: d.error }); }
    setMsg({ ok: true, text: v ? "Emails will mention that you are speaking with a small group of enterprise leaders." : "Emails will not mention a small group." });
    router.refresh();
  }
  const field = (name: keyof Hypothesis, label: string, hint: string, rows: number) => (
    <label className="block text-sm" key={name}>
      <span className="font-medium text-ink-900">{label}</span>
      <span className="block text-xs text-ink-500">{hint}</span>
      <textarea value={cur[name]} rows={rows} disabled={!p.canEdit} onChange={(e) => setDraft((x) => ({ ...x, [key]: { ...cur, [name]: e.target.value } }))} className="mt-1.5 w-full resize-y rounded-xl border border-line bg-canvas p-3 text-sm leading-relaxed focus:border-brand-300 focus:bg-white focus:outline-none disabled:opacity-60" />
    </label>
  );

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="rounded-xl border border-line p-3 text-sm">
        <div className="font-medium text-ink-900">Founder outreach</div>
        <p className="mt-1 text-ink-600">Emails signed by {p.founders.length ? p.founders.join(" or ") : "a founder"} ask for 20 minutes to learn how a specific problem looks for that person, tied to a KPI, and offer something back. Anyone whose signature says &quot;founder&quot; gets this style. Everyone else keeps the standard style.</p>
        <label className="mt-3 flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 accent-brand-500" checked={group} disabled={!p.canEdit} onChange={(e) => void toggle(e.target.checked)} />
          <span>Mention that I&apos;m speaking with a small group of enterprise leaders<span className="block text-xs text-ink-500">Turn this off if it stops being true. The wording never includes a number or names.</span></span>
        </label>
      </div>

      <div>
        <div className="text-sm font-medium text-ink-900">What the agent asks each persona about</div>
        <p className="text-xs text-ink-500">The app picks one line per contact from the play the account earned and the contact&apos;s persona. Claude writes from it and never invents the pain.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLAYS.map((pl) => <button key={pl} onClick={() => { setPlay(pl); setMsg(null); }} className={cn("rounded-full border px-3 py-1 text-sm", play === pl ? "border-ink-900 bg-ink-900 text-white" : "border-line text-ink-700 hover:bg-canvas")} title={PLAY_NAME[pl]}>{PLAY_SHORT[pl]}</button>)}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.personas.map((per) => (
            <button key={per.key} onClick={() => { setPersona(per.key); setMsg(null); }} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm", persona === per.key ? "border-ink-900 bg-ink-900 text-white" : "border-line text-ink-700 hover:bg-canvas")}>
              {per.label}{has(play, per.key) ? <span className={cn("size-1.5 rounded-full", persona === per.key ? "bg-white" : "bg-emerald-500")} aria-label="has a line" /> : null}
            </button>
          ))}
        </div>
      </div>

      {has(play, persona) || draft[key] ? (
        <div className="flex flex-col gap-3">
          {field("guess", "The hypothesis", "Finishes \"I'd guess ...\". Tied to a KPI they are judged on. Use {company} for the company name.", 3)}
          {field("share", "What I can share", "Something you can really offer on the call. Finishes \"Could I take 20 minutes? I can share ...\"", 2)}
          {field("subject", "Subject idea", "3 to 8 words, plain.", 1)}
          <div className="flex flex-wrap items-center gap-3">
            {p.canEdit ? <Button onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</Button> : <span className="text-sm text-ink-500">Only admins can edit.</span>}
            {dirty ? <button className="text-sm text-ink-500 hover:text-ink-900" onClick={() => setDraft((x) => { const n = { ...x }; delete n[key]; return n; })}>Discard changes</button> : null}
            {p.custom[key] ? <span className="ml-auto text-xs text-ink-400">Edited from the starting line</span> : <span className="ml-auto text-xs text-ink-400">Starting line</span>}
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-canvas px-3 py-2 text-sm text-ink-600">No line for this persona on {PLAY_SHORT[play]}. Contacts like this get only a short &quot;who owns this?&quot; note, or wait in nurture.</p>
      )}
      {msg ? <div role="status" className={cn("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-brand-50 text-brand-700")}>{msg.text}</div> : null}
    </div>
  );
}
