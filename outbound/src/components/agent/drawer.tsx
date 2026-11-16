"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, History, Loader2, MessageSquarePlus, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Action = { id: string; title: string; status: "proposed" | "approved" | "rejected" | "executed" | "failed"; est_credits: number; run_id?: string | null };
type Msg = { id: string; role: "user" | "assistant"; content: string; runId?: string | null; actions?: Action[]; cost?: { usd: number; credits: number } };
type Thread = { id: string; title: string };

const STATUS_LABEL: Record<string, string> = { proposed: "Waiting for you", approved: "Running", executed: "Done", rejected: "Rejected", failed: "Failed" };
const TOOL_LABEL = (n: string) => n.replace(/__/g, " / ").replace(/_/g, " ");

/** Minimal text formatting: paragraphs, bullets and bold. No HTML is ever injected. */
function Rich({ text }: { text: string }) {
  const blocks: Array<{ ul: boolean; lines: string[] }> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { blocks.push({ ul: false, lines: [] }); continue; }
    const bullet = /^\s*[-*]\s+/.test(line);
    const last = blocks[blocks.length - 1];
    if (last && last.ul === bullet && last.lines.length) last.lines.push(line.replace(/^\s*[-*]\s+/, ""));
    else blocks.push({ ul: bullet, lines: [line.replace(/^\s*[-*]\s+/, "")] });
  }
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.filter((b) => b.lines.length).map((b, i) => b.ul
        ? <ul key={i} className="ml-4 list-disc space-y-0.5">{b.lines.map((l, j) => <li key={j}>{bold(l)}</li>)}</ul>
        : <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j ? <br /> : null}{bold(l)}</Fragment>)}</p>)}
    </div>
  );
}

export function AgentDrawer() {
  const pathname = usePathname();
  const accountId = pathname.match(/^\/accounts\/([0-9a-f-]{36})/i)?.[1] ?? null;
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [showThreads, setShowThreads] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<string[]>([]);
  const [warn, setWarn] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, live, open]);

  const loadThreads = useCallback(async () => {
    const r = await fetch("/api/agent/threads").then((x) => x.json()).catch(() => null);
    if (r?.ok) setThreads(r.threads);
  }, []);

  const openThread = useCallback(async (id: string) => {
    const r = await fetch(`/api/agent/threads/${id}`).then((x) => x.json()).catch(() => null);
    if (!r?.ok) return;
    const acts: Action[] = r.actions;
    setThreadId(id);
    setMsgs((r.messages as Array<{ id: string; role: "user" | "assistant"; content: string; run_id: string | null }>).map((m) => ({ id: m.id, role: m.role, content: m.content, runId: m.run_id, actions: m.role === "assistant" && m.run_id ? acts.filter((a) => a.run_id === m.run_id) : undefined })));
    setShowThreads(false);
  }, []);

  function newChat() { setThreadId(null); setMsgs([]); setLive([]); setErr(null); setShowThreads(false); }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setErr(null); setWarn(null); setBusy(true); setLive([]);
    const uid = `u${Date.now()}`, aid = `a${Date.now()}`;
    setMsgs((m) => [...m, { id: uid, role: "user", content: text }, { id: aid, role: "assistant", content: "", actions: [] }]);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/agent/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId, text, page: pathname, accountId }), signal: abort.current.signal });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => null); throw new Error(j?.error ?? "Could not reach the assistant"); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const e = JSON.parse(line.slice(6));
          if (e.type === "thread") setThreadId(e.threadId);
          else if (e.type === "run") setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, runId: e.runId } : x)));
          else if (e.type === "text") setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, content: x.content + e.delta } : x)));
          else if (e.type === "tool") setLive((l) => (e.status === "start" ? [...l, TOOL_LABEL(e.name)] : l));
          else if (e.type === "action") setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, actions: [...(x.actions ?? []), { id: e.actionId, title: e.title, status: "proposed", est_credits: e.estCredits }] } : x)));
          else if (e.type === "warn") setWarn(e.text);
          else if (e.type === "done") setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, cost: { usd: e.usd, credits: e.credits } } : x)));
          else if (e.type === "error") setErr(e.message);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message);
    } finally {
      setBusy(false); setLive([]); abort.current = null; void loadThreads();
    }
  }

  async function decide(a: Action, approve: boolean) {
    setMsgs((m) => m.map((x) => ({ ...x, actions: x.actions?.map((y) => (y.id === a.id ? { ...y, status: approve ? "approved" : "rejected" } : y)) })));
    const r = await fetch(`/api/agent/actions/${a.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Network problem" }));
    if (!r.ok) setErr(r.error);
    if (threadId) await openThread(threadId);
  }

  const empty = msgs.length === 0;
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Open the assistant" title="Assistant (Ctrl or Cmd + K)" className={cn("fixed bottom-20 right-4 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-medium text-white shadow-lg hover:bg-brand-700 md:bottom-6 md:right-6", open && "hidden")}>
        <Sparkles size={18} /> <span className="hidden sm:inline">Assistant</span>
      </button>
      {open ? <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setOpen(false)} /> : null}
      <aside className={cn("fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-line bg-white shadow-2xl transition-transform duration-200", open ? "translate-x-0" : "translate-x-full")} aria-hidden={!open}>
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-brand-600" /> Assistant</div>
          <div className="flex items-center gap-1">
            <button onClick={() => { setShowThreads((s) => !s); void loadThreads(); }} className="rounded-lg p-2 text-ink-500 hover:bg-canvas" aria-label="Past chats" title="Past chats"><History size={16} /></button>
            <button onClick={newChat} className="rounded-lg p-2 text-ink-500 hover:bg-canvas" aria-label="New chat" title="New chat"><MessageSquarePlus size={16} /></button>
            <Link href="/agent" className="rounded-lg px-2 py-1.5 text-xs text-ink-500 hover:bg-canvas">Traces</Link>
            <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-ink-500 hover:bg-canvas" aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        {showThreads ? (
          <div className="flex-1 overflow-y-auto p-2">
            {threads.length === 0 ? <p className="p-4 text-sm text-ink-500">No past chats yet.</p> : threads.map((t) => (
              <button key={t.id} onClick={() => void openThread(t.id)} className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas">{t.title}</button>
            ))}
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {empty ? (
              <div className="space-y-3 pt-6 text-sm text-ink-600">
                <p className="text-base font-semibold text-ink-900">Ask about your accounts, contacts and campaigns.</p>
                <p>I read your data and use the integrations that are switched on. Anything that changes something waits for your approval.</p>
                <div className="grid gap-2 pt-1">
                  {(accountId ? ["Summarise this account for me", "Who are the contacts here and who is missing?", "What is the state of the campaign?"] : ["Which super hot accounts have no campaign?", "What is on my plate today?", "Who replied this week?"]).map((q) => (
                    <button key={q} onClick={() => setInput(q)} className="rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-brand-200 hover:bg-brand-50">{q}</button>
                  ))}
                </div>
              </div>
            ) : null}
            {msgs.map((m) => (
              <div key={m.id} className={cn(m.role === "user" ? "ml-8 rounded-2xl bg-brand-50 px-3.5 py-2.5 text-sm" : "")}>
                {m.role === "user" ? m.content : (
                  <div>
                    {m.content ? <Rich text={m.content} /> : busy && m.id === msgs[msgs.length - 1]?.id ? <span className="inline-flex items-center gap-2 text-sm text-ink-400"><Loader2 size={14} className="animate-spin" /> {live.length ? `Using ${live[live.length - 1]}` : "Thinking"}</span> : null}
                    {m.actions?.map((a) => (
                      <div key={a.id} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{a.title}</span>
                          <span className="text-xs text-ink-500">{STATUS_LABEL[a.status]}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-500">About {a.est_credits} Tapistro credits. Nothing has run yet.</p>
                        {a.status === "proposed" ? (
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => void decide(a, true)} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"><Check size={13} /> Approve</button>
                            <button onClick={() => void decide(a, false)} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium hover:bg-canvas">Reject</button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {m.cost && m.runId ? <p className="mt-2 text-[11px] text-ink-400">${m.cost.usd.toFixed(3)}{m.cost.credits ? ` · ${m.cost.credits} credits` : ""} · <Link href={`/agent/runs/${m.runId}`} className="underline hover:text-ink-700">trace</Link></p> : null}
                  </div>
                )}
              </div>
            ))}
            {warn ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{warn}</p> : null}
            {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p> : null}
            <div ref={bottom} />
          </div>
        )}

        <div className="border-t border-line p-3">
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 focus-within:border-brand-300">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={1} placeholder={accountId ? "Ask about this account" : "Ask anything about your outbound"} className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none" />
            {busy ? <button onClick={() => abort.current?.abort()} className="rounded-xl border border-line px-3 py-2 text-xs font-medium hover:bg-canvas">Stop</button> : <button onClick={() => void send()} disabled={!input.trim()} className="rounded-xl bg-brand-600 p-2.5 text-white hover:bg-brand-700 disabled:opacity-40" aria-label="Send"><Send size={15} /></button>}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-ink-400">Reads your data. Changes wait for your approval. It never sends messages.</p>
        </div>
      </aside>
    </>
  );
}
