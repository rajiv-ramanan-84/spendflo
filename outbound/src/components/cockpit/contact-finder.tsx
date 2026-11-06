"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Search, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Candidate = { full_name: string; title: string; linkedin_url: string; location?: string | null; source_url?: string | null; evidence: string; confidence: "high" | "medium" | "low" };

/** Opens the finder from anywhere on the page, e.g. a review flag about a missing contact. */
export function openContactFinder(lookingFor: string) {
  window.dispatchEvent(new CustomEvent("find-contacts", { detail: lookingFor }));
}

const TONE = { high: "bg-emerald-50 text-emerald-700", medium: "bg-amber-50 text-amber-800", low: "bg-canvas text-ink-500" };

export function ContactFinder({ accountId, accountName }: { accountId: string; accountName: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [lookingFor, setLookingFor] = useState("Coupa admin or system owner; contract manager");
  const [busy, setBusy] = useState<"search" | "add" | null>(null);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      setLookingFor((e as CustomEvent<string>).detail);
      setOpen(true);
      setResults(null);
      setMsg(null);
      setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    };
    window.addEventListener("find-contacts", on);
    return () => window.removeEventListener("find-contacts", on);
  }, []);

  async function search() {
    setBusy("search");
    setMsg(null);
    setResults(null);
    const res = await fetch(`/api/accounts/${accountId}/find-contacts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lookingFor }) });
    const data = await res.json().catch(() => ({ ok: false, error: "No response" }));
    setBusy(null);
    if (!data.ok) return setMsg({ ok: false, text: data.error });
    setResults(data.candidates);
    setNote(data.note);
    setPicked(data.candidates.filter((c: Candidate) => c.confidence !== "low").map((c: Candidate) => c.linkedin_url));
  }

  async function add() {
    if (!results) return;
    setBusy("add");
    setMsg(null);
    const people = results.filter((c) => picked.includes(c.linkedin_url)).map((c) => ({ full_name: c.full_name, title: c.title, linkedin_url: c.linkedin_url, location: c.location ?? null, source_url: c.source_url ?? null, evidence: c.evidence }));
    const res = await fetch(`/api/accounts/${accountId}/add-contacts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ people }) });
    const data = await res.json().catch(() => ({ ok: false, error: "No response" }));
    setBusy(null);
    if (!data.ok) return setMsg({ ok: false, text: data.error });
    setMsg({ ok: true, text: `Added ${people.length} to the Contacts tab (${data.contactIds.join(", ")}) and synced. Regenerate the draft to give them a track.` });
    setResults(null);
    router.refresh();
  }

  if (!open) {
    return (
      <div ref={ref} className="flex justify-end">
        <Button variant="secondary" onClick={() => setOpen(true)}><Search size={16} /> Find contacts on the web</Button>
      </div>
    );
  }

  return (
    <Card className="scroll-mt-24 p-5 md:p-6">
      <div ref={ref} className="scroll-mt-24" />
      <h2 className="text-lg font-semibold">Find contacts at {accountName}</h2>
      <p className="mt-1 text-sm text-ink-500">Claude runs a few live web searches and suggests people with their public LinkedIn profile. You pick who to add; they go into the Contacts tab with an Account ID and Contact ID. No emails or phone numbers are guessed. About $0.05 to $0.15 a search.</p>
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex-1 text-sm">
          <span className="font-medium">Who are you looking for?</span>
          <textarea value={lookingFor} onChange={(e) => setLookingFor(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-line bg-white p-3 text-sm" />
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy !== null}>Close</Button>
          <Button onClick={search} disabled={busy !== null || lookingFor.trim().length < 3}><Search size={16} /> {busy === "search" ? "Searching... about a minute" : "Search the web"}</Button>
        </div>
      </div>

      {msg ? <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p> : null}

      {results ? (
        <div className="mt-4">
          {note ? <p className="mb-3 text-xs text-ink-500">{note}</p> : null}
          {results.length === 0 ? <p className="text-sm text-ink-500">No one found with public evidence they work there now. Try different titles.</p> : (
            <ul className="grid gap-2">
              {results.map((c) => (
                <li key={c.linkedin_url} className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
                  <input type="checkbox" className="mt-1 accent-brand-500" checked={picked.includes(c.linkedin_url)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.linkedin_url] : p.filter((x) => x !== c.linkedin_url)))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c.full_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[c.confidence]}`}>{c.confidence}</span>
                      <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">LinkedIn <ExternalLink size={12} /></a>
                    </div>
                    <div className="text-ink-700">{c.title}{c.location ? <span className="text-ink-400"> · {c.location}</span> : null}</div>
                    <div className="text-xs text-ink-500">{c.evidence}{c.source_url ? <> · <a href={c.source_url} target="_blank" rel="noreferrer" className="underline">source</a></> : null}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {results.length ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-400">Open each LinkedIn link to confirm before adding.</span>
              <Button onClick={add} disabled={busy !== null || picked.length === 0}><UserPlus size={16} /> {busy === "add" ? "Adding and syncing..." : `Add ${picked.length} to the sheet`}</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
