"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Version = { versionNo: number; chars: number; editedBy: string | null; createdAt: string };
type Props = { current: Version | null; history: Version[]; warnings: string[]; canEdit: boolean };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function SkillSettings(p: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; warnings?: string[] } | null>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setMsg(null);
    setPending({ name: f.name, text: await f.text() });
  }

  async function save() {
    if (!pending) return;
    setBusy(true);
    const res = await fetch("/api/settings/skill", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: pending.text }) });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) return setMsg({ ok: false, text: data.error });
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
    setMsg({ ok: true, text: `Saved as version ${data.versionNo}. The next draft uses it.`, warnings: data.warnings });
    router.refresh();
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-brand-500" />
            <h2 className="text-lg font-semibold">Claude campaign skill</h2>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            The playbook Claude follows for every draft, re-plan and reply. Change the tone, email rules or examples freely: the app enforces the output format on its own, so wording changes cannot break it.
          </p>
        </div>
        {p.current ? (
          <div className="text-right text-sm">
            <div className="font-semibold">Version {p.current.versionNo}</div>
            <div className="text-xs text-ink-400">{p.current.editedBy ? `${p.current.editedBy}, ` : ""}{when(p.current.createdAt)} · {Math.round(p.current.chars / 1000)}k characters</div>
          </div>
        ) : <span className="text-sm text-amber-700">No skill yet</span>}
      </div>

      <ol className="mt-4 grid gap-1.5 text-sm text-ink-700">
        <li><span className="font-medium">1.</span> Download the current skill.</li>
        <li><span className="font-medium">2.</span> Edit it in any text editor or in Claude.</li>
        <li><span className="font-medium">3.</span> Upload it here. The next draft uses it; earlier drafts keep the version that wrote them.</li>
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {p.current ? (
          <a href="/api/settings/skill/download" className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink-900 hover:border-brand-200 hover:bg-brand-50">
            <Download size={16} /> Download current
          </a>
        ) : null}
        {p.canEdit ? (
          <>
            <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}><FileUp size={16} /> Upload edited skill</Button>
          </>
        ) : <span className="text-xs text-ink-400">Admins can upload a new version.</span>}
      </div>

      {pending ? (
        <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-4 text-sm">
          <div className="font-medium">{pending.name}</div>
          <div className="mt-1 text-ink-500">
            {Math.round(pending.text.length / 1000)}k characters{p.current ? ` (current is ${Math.round(p.current.chars / 1000)}k)` : ""}. Saves as version {(p.current?.versionNo ?? 0) + 1}.
          </div>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-xs text-ink-700">{pending.text.slice(0, 1500)}{pending.text.length > 1500 ? "\n..." : ""}</pre>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setPending(null); if (fileRef.current) fileRef.current.value = ""; }} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving..." : `Save as version ${(p.current?.versionNo ?? 0) + 1}`}</Button>
          </div>
        </div>
      ) : null}

      {msg ? (
        <div className={`mt-4 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.text}
          {msg.warnings?.length ? <ul className="mt-1 list-disc pl-5 text-amber-800">{msg.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
        </div>
      ) : p.warnings.length ? (
        <ul className="mt-4 list-disc rounded-xl bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-800">{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      ) : null}

      {p.history.length > 1 ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink-500 hover:text-ink-900">Earlier versions</summary>
          <ul className="mt-2 grid gap-1">
            {p.history.slice(1).map((v) => (
              <li key={v.versionNo} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-canvas">
                <span>Version {v.versionNo} <span className="text-ink-400">· {v.editedBy ? `${v.editedBy}, ` : ""}{when(v.createdAt)}</span></span>
                <a href={`/api/settings/skill/download?version=${v.versionNo}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">Download</a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
