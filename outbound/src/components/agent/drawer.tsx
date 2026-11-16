"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookmarkPlus, Check, Copy, FileText, History, Loader2, MessageSquarePlus, Paperclip, Plus, RotateCcw, Send, Sparkles, Trash2, User, Building2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ACCEPT, extractText } from "@/lib/agent/extract";

type Action = { id: string; title: string; status: "proposed" | "approved" | "rejected" | "executed" | "failed"; est_credits: number; run_id?: string | null; summary?: string | null };
type Ctx = { type: "account" | "contact"; id: string; label: string; auto?: boolean };
type FileChip = { key: string; id?: string; name: string; status: "reading" | "ready" | "error"; tokens?: number; phones?: number; emails?: number; error?: string };
type Meta = { contexts?: Ctx[]; files?: Array<{ id: string; name: string }> };
type Msg = { id: string; role: "user" | "assistant"; content: string; runId?: string | null; actions?: Action[]; cost?: { usd: number; credits: number }; meta?: Meta | null };
type Thread = { id: string; title: string };
type Mention = { type: "account" | "contact"; id: string; label: string; sub: string };
type Saved = { id: string; title: string; body: string };
type LibFile = { id: string; name: string; tokens_est: number; chars: number; archived_at: string | null; created_at: string };

const STATUS_LABEL: Record<string, string> = { proposed: "Waiting for you", approved: "Running", executed: "Done", rejected: "Rejected", failed: "Failed" };
const TOOL_LABEL = (n: string) => n.replace(/__/g, " / ").replace(/_/g, " ");
const j = (url: string, init?: RequestInit) => fetch(url, init).then((x) => x.json()).catch(() => ({ ok: false, error: "Network problem" }));

/** Answers as formatted text: lists, tables, links. No HTML from the model is ever rendered. */
function Markdown({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">{children}</a>,
          ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-0.5">{children}</ol>,
          h1: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-1 mt-3 text-[15px] font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold">{children}</h4>,
          code: ({ children }) => <code className="rounded bg-canvas px-1 py-0.5 text-[12px]">{children}</code>,
          pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-xl bg-canvas p-3 text-xs">{children}</pre>,
          blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-line pl-3 text-ink-600">{children}</blockquote>,
          table: ({ children }) => <div className="my-2 overflow-x-auto rounded-xl border border-line"><table className="w-full text-xs">{children}</table></div>,
          th: ({ children }) => <th className="border-b border-line bg-canvas px-2.5 py-1.5 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b border-line px-2.5 py-1.5 align-top last:border-b-0">{children}</td>,
        }}
      >{text}</ReactMarkdown>
    </div>
  );
}

const Chip = ({ children, onRemove, tone = "neutral" }: { children: React.ReactNode; onRemove?: () => void; tone?: "neutral" | "warn" | "bad" }) => (
  <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", tone === "bad" ? "border-rose-200 bg-rose-50 text-rose-700" : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-line bg-white text-ink-700")}>
    <span className="flex min-w-0 items-center gap-1.5 truncate">{children}</span>
    {onRemove ? <button onClick={onRemove} aria-label="Remove" className="text-ink-400 hover:text-ink-900"><X size={12} /></button> : null}
  </span>
);

export function AgentDrawer({ priceIn }: { priceIn: number }) {
  const pathname = usePathname();
  const pageAccountId = pathname.match(/^\/accounts\/([0-9a-f-]{36})/i)?.[1] ?? null;
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
  const [ctx, setCtx] = useState<Ctx[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [files, setFiles] = useState<FileChip[]>([]);
  const [menu, setMenu] = useState<null | "root" | "files" | "prompts" | "accounts">(null);
  const [prompts, setPrompts] = useState<Saved[]>([]);
  const [lib, setLib] = useState<LibFile[]>([]);
  const [libArchived, setLibArchived] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const [pickItems, setPickItems] = useState<Mention[]>([]);
  const [mention, setMention] = useState<{ q: string; items: Mention[]; idx: number } | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const last = useRef<{ text: string; ctx: Ctx[]; fileIds: string[] } | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } if (e.key === "Escape") { setMenu(null); setMention(null); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, live, open]);

  // The account on the page is added as context, and can be removed.
  useEffect(() => {
    if (!open || !pageAccountId || dismissed.includes(pageAccountId) || ctx.some((c) => c.id === pageAccountId)) return;
    let live = true;
    void j(`/api/agent/mentions?id=${pageAccountId}`).then((r) => { if (live && r.ok && r.items[0]) setCtx((c) => (c.some((x) => x.id === pageAccountId) ? c : [...c, { type: "account", id: pageAccountId, label: r.items[0].label, auto: true }])); });
    return () => { live = false; };
  }, [open, pageAccountId, dismissed, ctx]);

  const loadThreads = useCallback(async () => { const r = await j("/api/agent/threads"); if (r.ok) setThreads(r.threads); }, []);
  const openThread = useCallback(async (id: string) => {
    const r = await j(`/api/agent/threads/${id}`);
    if (!r.ok) return;
    const acts: Action[] = r.actions;
    setThreadId(id);
    setMsgs((r.messages as Array<{ id: string; role: "user" | "assistant"; content: string; run_id: string | null; meta: Meta | null }>).map((m) => ({ id: m.id, role: m.role, content: m.content, runId: m.run_id, meta: m.meta, actions: m.role === "assistant" && m.run_id ? acts.filter((a) => a.run_id === m.run_id) : undefined })));
    setShowThreads(false);
  }, []);
  function newChat() { setThreadId(null); setMsgs([]); setLive([]); setErr(null); setShowThreads(false); setFiles([]); setCtx((c) => c.filter((x) => x.auto)); }

  // ---- context and files
  const addCtx = (m: Mention) => { setCtx((c) => (c.some((x) => x.id === m.id) ? c : [...c, { type: m.type, id: m.id, label: m.label }])); setMenu(null); setMention(null); };
  const removeCtx = (c: Ctx) => { setCtx((l) => l.filter((x) => x.id !== c.id)); if (c.auto) setDismissed((d) => [...d, c.id]); };

  async function addFiles(list: FileList | File[]) {
    setMenu(null);
    for (const f of Array.from(list).slice(0, 8)) {
      const key = `${f.name}-${Date.now()}-${Math.random()}`;
      setFiles((l) => [...l, { key, name: f.name, status: "reading" }]);
      try {
        const { text, pages } = await extractText(f);
        const r = await j("/api/agent/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name, mime: f.type, sizeBytes: f.size, pages, text }) });
        if (!r.ok) throw new Error(r.error);
        setFiles((l) => l.map((x) => (x.key === key ? { ...x, id: r.file.id, status: "ready", tokens: r.file.tokens_est, phones: r.file.phones_removed, emails: r.file.emails_removed } : x)));
      } catch (e) {
        setFiles((l) => l.map((x) => (x.key === key ? { ...x, status: "error", error: (e as Error).message } : x)));
      }
    }
  }
  function attachFromLibrary(f: LibFile) { setMenu(null); if (files.some((x) => x.id === f.id)) return; setFiles((l) => [...l, { key: f.id, id: f.id, name: f.name, status: "ready", tokens: f.tokens_est }]); }
  async function openMenu(m: "files" | "prompts" | "accounts") {
    setMenu(m);
    if (m === "files") { const r = await j(`/api/agent/files${libArchived ? "?archived=1" : ""}`); if (r.ok) setLib(r.files); }
    if (m === "prompts") { const r = await j("/api/agent/prompts"); if (r.ok) setPrompts(r.prompts); }
    if (m === "accounts") { setPickQ(""); const r = await j("/api/agent/mentions"); if (r.ok) setPickItems(r.items); }
  }
  async function searchPick(q: string) { setPickQ(q); const r = await j(`/api/agent/mentions?q=${encodeURIComponent(q)}`); if (r.ok) setPickItems(r.items); }
  async function savePrompt() {
    if (!saveTitle.trim() || !input.trim()) return;
    const r = await j("/api/agent/prompts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: saveTitle.trim(), body: input.trim() }) });
    if (r.ok) { setPrompts((p) => [r.prompt, ...p]); setSaveTitle(""); }
  }

  // ---- typing: @ opens the account picker, / at the start opens saved prompts
  async function onType(v: string) {
    setInput(v);
    const m = v.match(/(?:^|\s)@([^\s@]{0,30})$/);
    if (m) { const r = await j(`/api/agent/mentions?q=${encodeURIComponent(m[1])}`); setMention(r.ok ? { q: m[1], items: r.items, idx: 0 } : null); } else setMention(null);
    if (v.startsWith("/") && !v.includes(" ") && !prompts.length) { const r = await j("/api/agent/prompts"); if (r.ok) setPrompts(r.prompts); }
  }
  const slash = input.startsWith("/") && !input.includes(" ") ? prompts.filter((p) => p.title.toLowerCase().includes(input.slice(1).toLowerCase())).slice(0, 6) : [];
  function pickMention(m: Mention) { setInput((v) => v.replace(/(?:^|\s)@[^\s@]{0,30}$/, (s) => (s.startsWith(" ") ? " " : ""))); addCtx(m); }

  const ready = files.filter((f) => f.status === "ready" && f.id);
  const estTokens = Math.ceil(input.length / 4) + ready.reduce((n, f) => n + (f.tokens ?? 0), 0) + ctx.length * 1500;
  const estUsd = (estTokens * priceIn) / 1_000_000;

  async function send(over?: { text: string; ctx: Ctx[]; fileIds: string[] }) {
    const text = (over?.text ?? input).trim();
    if (!text || busy || files.some((f) => f.status === "reading")) return;
    const sendCtx = over?.ctx ?? ctx;
    const fileIds = over?.fileIds ?? ready.map((f) => f.id!);
    last.current = { text, ctx: sendCtx, fileIds };
    const meta: Meta = { contexts: sendCtx, files: over ? [] : ready.map((f) => ({ id: f.id!, name: f.name })) };
    setInput(""); setErr(null); setWarn(null); setBusy(true); setLive([]); setMention(null); setMenu(null);
    if (!over) setFiles([]);
    const uid = `u${Date.now()}`, aid = `a${Date.now()}`;
    setMsgs((m) => [...m, { id: uid, role: "user", content: text, meta }, { id: aid, role: "assistant", content: "", actions: [] }]);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/agent/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId, text, page: pathname, accountId: pageAccountId, contexts: sendCtx.map((c) => ({ type: c.type, id: c.id })), fileIds }), signal: abort.current.signal });
      if (!res.ok || !res.body) { const e = await res.json().catch(() => null); throw new Error(e?.error ?? "Could not reach the assistant"); }
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
          else if (e.type === "action") setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, actions: [...(x.actions ?? []), { id: e.actionId, title: e.title, status: "proposed", est_credits: e.estCredits, summary: e.summary }] } : x)));
          else if (e.type === "warn") setWarn(e.text);
          else if (e.type === "done") setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, cost: { usd: e.usd, credits: e.credits } } : x)));
          else if (e.type === "error") setErr(e.message);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") { setErr((e as Error).message); setMsgs((m) => m.filter((x) => x.id !== aid || x.content)); }
    } finally { setBusy(false); setLive([]); abort.current = null; void loadThreads(); }
  }

  async function decide(a: Action, approve: boolean) {
    setMsgs((m) => m.map((x) => ({ ...x, actions: x.actions?.map((y) => (y.id === a.id ? { ...y, status: approve ? "approved" : "rejected" } : y)) })));
    const r = await j(`/api/agent/actions/${a.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve }) });
    if (!r.ok) setErr(r.error);
    if (threadId) await openThread(threadId);
  }
  const copy = async (id: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(id); window.setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ } };

  const empty = msgs.length === 0;
  const sendable = input.trim() && !busy && !files.some((f) => f.status === "reading");
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Open the assistant" title="Assistant (Ctrl or Cmd + K)" className={cn("fixed bottom-20 right-4 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-medium text-white shadow-lg hover:bg-brand-700 md:bottom-6 md:right-6", open && "hidden")}>
        <Sparkles size={18} /> <span className="hidden sm:inline">Assistant</span>
      </button>
      {open ? <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setOpen(false)} /> : null}
      <aside onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files); }} className={cn("fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-line bg-white shadow-2xl transition-transform duration-200", open ? "translate-x-0" : "translate-x-full")} aria-hidden={!open}>
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-brand-600" /> Assistant</div>
          <div className="flex items-center gap-1">
            <button onClick={() => { setShowThreads((s) => !s); void loadThreads(); }} className="rounded-lg p-2 text-ink-500 hover:bg-canvas" aria-label="Past chats" title="Past chats"><History size={16} /></button>
            <button onClick={newChat} className="rounded-lg p-2 text-ink-500 hover:bg-canvas" aria-label="New chat" title="New chat"><MessageSquarePlus size={16} /></button>
            <Link href="/agent" className="rounded-lg px-2 py-1.5 text-xs text-ink-500 hover:bg-canvas">Traces</Link>
            <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-ink-500 hover:bg-canvas" aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        {drag ? <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-brand-50/90 text-sm font-medium text-brand-700">Drop files to read them</div> : null}

        {showThreads ? (
          <div className="flex-1 overflow-y-auto p-2">
            {threads.length === 0 ? <p className="p-4 text-sm text-ink-500">No past chats yet.</p> : threads.map((t) => <button key={t.id} onClick={() => void openThread(t.id)} className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas">{t.title}</button>)}
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {empty ? (
              <div className="space-y-3 pt-6 text-sm text-ink-600">
                <p className="text-base font-semibold text-ink-900">Ask about your accounts, contacts and campaigns.</p>
                <p>Type <b>@</b> to pick an account as context, or use <b>+</b> to attach a file or reuse a saved prompt. Anything that changes something waits for your approval.</p>
                <div className="grid gap-2 pt-1">
                  {(pageAccountId ? ["Summarise this account for me", "Who are the contacts here and who is missing?", "What is the state of the campaign?"] : ["Which super hot accounts have no campaign?", "What is on my plate today?", "Who replied this week?"]).map((q) => <button key={q} onClick={() => setInput(q)} className="rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-brand-200 hover:bg-brand-50">{q}</button>)}
                </div>
              </div>
            ) : null}
            {msgs.map((m, i) => (
              <div key={m.id} className={cn("group", m.role === "user" ? "ml-8" : "")}>
                {m.role === "user" ? (
                  <div className="rounded-2xl bg-brand-50 px-3.5 py-2.5 text-sm">
                    {m.meta?.contexts?.length || m.meta?.files?.length ? <div className="mb-1.5 flex flex-wrap gap-1.5">{m.meta?.contexts?.map((c) => <Chip key={c.id}>{c.type === "account" ? <Building2 size={12} /> : <User size={12} />}{c.label}</Chip>)}{m.meta?.files?.map((f) => <Chip key={f.id}><FileText size={12} />{f.name}</Chip>)}</div> : null}
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                ) : (
                  <div>
                    {m.content ? <Markdown text={m.content} /> : busy && i === msgs.length - 1 ? <span className="inline-flex items-center gap-2 text-sm text-ink-400"><Loader2 size={14} className="animate-spin" /> {live.length ? `Using ${live[live.length - 1]}` : "Thinking"}</span> : null}
                    {m.actions?.map((a) => (
                      <div key={a.id} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                        <div className="flex items-start justify-between gap-2"><span className="font-medium">{a.summary ? "Change a setting" : a.title}</span><span className="shrink-0 text-xs text-ink-500">{STATUS_LABEL[a.status]}</span></div>
                        {a.summary ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink-700">{a.summary}</p> : null}
                        <p className="mt-0.5 text-xs text-ink-500">{a.est_credits ? `About ${a.est_credits} Tapistro credits. ` : ""}{a.status === "proposed" ? "Nothing has changed yet." : ""}</p>
                        {a.status === "proposed" ? <div className="mt-2 flex gap-2"><button onClick={() => void decide(a, true)} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"><Check size={13} /> Approve</button><button onClick={() => void decide(a, false)} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium hover:bg-canvas">Reject</button></div> : null}
                      </div>
                    ))}
                    {m.content && !(busy && i === msgs.length - 1) ? (
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-400">
                        <button onClick={() => void copy(m.id, m.content)} className="inline-flex items-center gap-1 opacity-0 transition-opacity hover:text-ink-700 group-hover:opacity-100 focus:opacity-100">{copied === m.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}</button>
                        {i === msgs.length - 1 && last.current ? <button onClick={() => void send(last.current!)} className="inline-flex items-center gap-1 opacity-0 transition-opacity hover:text-ink-700 group-hover:opacity-100 focus:opacity-100"><RotateCcw size={12} /> Try again</button> : null}
                        {m.cost && m.runId ? <span>${m.cost.usd.toFixed(3)}{m.cost.credits ? ` · ${m.cost.credits} credits` : ""} · <Link href={`/agent/runs/${m.runId}`} className="underline hover:text-ink-700">trace</Link></span> : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {warn ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{warn}</p> : null}
            {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p> : null}
            <div ref={bottom} />
          </div>
        )}

        <div className="relative border-t border-line p-3">
          {mention && mention.items.length ? (
            <div className="absolute inset-x-3 bottom-full mb-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-white shadow-xl" role="listbox" aria-label="Accounts and contacts">
              {mention.items.map((m, i) => <button key={m.id} role="option" aria-selected={i === mention.idx} onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(m)} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas", i === mention.idx && "bg-canvas")}>{m.type === "account" ? <Building2 size={14} className="text-ink-400" /> : <User size={14} className="text-ink-400" />}<span className="min-w-0 flex-1 truncate font-medium">{m.label}</span><span className="truncate text-xs text-ink-400">{m.sub}</span></button>)}
            </div>
          ) : slash.length ? (
            <div className="absolute inset-x-3 bottom-full mb-1 rounded-xl border border-line bg-white shadow-xl">
              {slash.map((p) => <button key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => setInput(p.body)} className="block w-full px-3 py-2 text-left hover:bg-canvas"><span className="block text-sm font-medium">{p.title}</span><span className="block truncate text-xs text-ink-400">{p.body}</span></button>)}
            </div>
          ) : null}

          {menu ? (
            <div className="absolute inset-x-3 bottom-full mb-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-xl">
              {menu === "root" ? (
                <>
                  <button onClick={() => fileInput.current?.click()} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-canvas"><Paperclip size={16} className="text-ink-500" /> Add file(s)</button>
                  <button onClick={() => void openMenu("files")} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-canvas"><FileText size={16} className="text-ink-500" /> Your files</button>
                  <button onClick={() => void openMenu("accounts")} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-canvas"><Building2 size={16} className="text-ink-500" /> Choose accounts</button>
                  <button onClick={() => void openMenu("prompts")} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-canvas"><Sparkles size={16} className="text-ink-500" /> Saved prompts</button>
                </>
              ) : menu === "files" ? (
                <div className="p-1.5">
                  <div className="mb-1.5 flex items-center justify-between text-xs"><button onClick={() => setMenu("root")} className="text-ink-500 hover:text-ink-900">Back</button><button onClick={() => { setLibArchived((a) => !a); setTimeout(() => void openMenu("files"), 0); }} className="text-brand-700 hover:underline">{libArchived ? "Show recent" : "Show archived"}</button></div>
                  {lib.length === 0 ? <p className="px-2 py-3 text-sm text-ink-500">No {libArchived ? "archived" : "recent"} files. Files older than 30 days move to archived and can still be attached.</p> : lib.map((f) => <button key={f.id} onClick={() => attachFromLibrary(f)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-canvas"><span className="truncate">{f.name}</span><span className="shrink-0 text-xs text-ink-400">{Math.round(f.tokens_est / 100) / 10}k tokens</span></button>)}
                </div>
              ) : menu === "accounts" ? (
                <div className="p-1.5">
                  <div className="mb-1.5 flex items-center gap-2"><button onClick={() => setMenu("root")} className="text-xs text-ink-500 hover:text-ink-900">Back</button><input autoFocus value={pickQ} onChange={(e) => void searchPick(e.target.value)} placeholder="Search accounts and people" className="flex-1 rounded-lg border border-line px-2.5 py-1.5 text-sm" /></div>
                  {pickItems.map((m) => <button key={m.id} onClick={() => addCtx(m)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-canvas">{m.type === "account" ? <Building2 size={14} className="text-ink-400" /> : <User size={14} className="text-ink-400" />}<span className="min-w-0 flex-1 truncate font-medium">{m.label}</span><span className="truncate text-xs text-ink-400">{m.sub}</span></button>)}
                </div>
              ) : (
                <div className="p-1.5">
                  <button onClick={() => setMenu("root")} className="mb-1.5 text-xs text-ink-500 hover:text-ink-900">Back</button>
                  {prompts.length === 0 ? <p className="px-2 py-2 text-sm text-ink-500">No saved prompts yet. Write one in the box, then save it here.</p> : prompts.map((p) => (
                    <div key={p.id} className="flex items-center gap-1 rounded-lg hover:bg-canvas"><button onClick={() => { setInput(p.body); setMenu(null); }} className="min-w-0 flex-1 px-2.5 py-2 text-left"><span className="block truncate text-sm font-medium">{p.title}</span><span className="block truncate text-xs text-ink-400">{p.body}</span></button><button aria-label={`Delete ${p.title}`} onClick={async () => { await j(`/api/agent/prompts/${p.id}`, { method: "DELETE" }); setPrompts((l) => l.filter((x) => x.id !== p.id)); }} className="p-2 text-ink-300 hover:text-rose-600"><Trash2 size={14} /></button></div>
                  ))}
                  <div className="mt-2 flex items-center gap-2 border-t border-line pt-2"><input value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} placeholder="Title for this prompt" className="flex-1 rounded-lg border border-line px-2.5 py-1.5 text-sm" /><button disabled={!saveTitle.trim() || !input.trim()} onClick={() => void savePrompt()} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"><BookmarkPlus size={13} /> Save</button></div>
                  {!input.trim() ? <p className="px-1 pt-1 text-[11px] text-ink-400">Type the prompt in the message box first, then save it.</p> : null}
                </div>
              )}
            </div>
          ) : null}

          {ctx.length || files.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {ctx.map((c) => <Chip key={c.id} onRemove={() => removeCtx(c)}>{c.type === "account" ? <Building2 size={12} /> : <User size={12} />}{c.label}</Chip>)}
              {files.map((f) => (
                <Chip key={f.key} tone={f.status === "error" ? "bad" : (f.phones || f.emails) ? "warn" : "neutral"} onRemove={() => setFiles((l) => l.filter((x) => x.key !== f.key))}>
                  {f.status === "reading" ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                  <span className="truncate">{f.name}</span>
                  {f.status === "ready" ? <span className="text-ink-400">{Math.round((f.tokens ?? 0) / 100) / 10}k tokens{f.phones || f.emails ? ` · ${(f.phones ?? 0) + (f.emails ?? 0)} contact details removed` : ""}</span> : f.status === "error" ? <span title={f.error}>{f.error?.slice(0, 60)}</span> : <span className="text-ink-400">reading</span>}
                </Chip>
              ))}
            </div>
          ) : null}

          <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 focus-within:border-brand-300">
            <button onClick={() => setMenu((m) => (m ? null : "root"))} aria-label="Add context" title="Add file, accounts or a saved prompt" className="rounded-xl p-2 text-ink-500 hover:bg-canvas"><Plus size={18} /></button>
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }} />
            <textarea value={input} onChange={(e) => void onType(e.target.value)} onKeyDown={(e) => {
              if (mention?.items.length) {
                if (e.key === "ArrowDown") { e.preventDefault(); setMention({ ...mention, idx: (mention.idx + 1) % mention.items.length }); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setMention({ ...mention, idx: (mention.idx - 1 + mention.items.length) % mention.items.length }); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(mention.items[mention.idx]); return; }
              }
              if (slash.length && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setInput(slash[0].body); return; }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
            }} rows={Math.min(6, Math.max(1, input.split("\n").length))} placeholder={pageAccountId ? "Ask about this account. @ adds more" : "Ask anything. @ adds an account"} className="max-h-36 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none" />
            {busy ? <button onClick={() => abort.current?.abort()} className="rounded-xl border border-line px-3 py-2 text-xs font-medium hover:bg-canvas">Stop</button> : <button onClick={() => void send()} disabled={!sendable} className="rounded-xl bg-brand-600 p-2.5 text-white hover:bg-brand-700 disabled:opacity-40" aria-label="Send"><Send size={15} /></button>}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-ink-400">{ready.length || estTokens > 3000 ? `About ${Math.round(estTokens / 100) / 10}k tokens, roughly $${estUsd < 0.01 ? "0.01" : estUsd.toFixed(2)}. ` : ""}Files are read in your browser. Phone numbers and personal emails are removed. Changes wait for your approval.</p>
        </div>
      </aside>
    </>
  );
}
