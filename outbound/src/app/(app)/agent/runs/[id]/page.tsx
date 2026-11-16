import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { canAssignAccounts, requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { model: "Model", tool: "Tool", approval: "Needs approval", action: "Approved action", guard: "Limit", error: "Error" };
const TONE: Record<string, string> = { ok: "border-line", pending: "border-amber-300 bg-amber-50/50", error: "border-rose-300 bg-rose-50/50", blocked: "border-amber-300 bg-amber-50/50" };

export default async function RunTrace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = supabaseAdmin();
  if (!db || !user.id) return null;
  const { data: run } = await db.from("agent_runs").select("*").eq("id", id).maybeSingle();
  if (!run || (run.user_id !== user.id && !canAssignAccounts(user))) notFound();
  const [{ data: steps }, { data: msgs }] = await Promise.all([
    db.from("agent_steps").select("*").eq("run_id", id).order("seq"),
    db.from("agent_messages").select("role, content, created_at").eq("run_id", id).order("created_at"),
  ]);
  const asked = (msgs ?? []).find((m) => m.role === "user")?.content as string | undefined;
  const secs = run.finished_at ? Math.round((Date.parse(run.finished_at as string) - Date.parse(run.started_at as string)) / 1000) : null;

  return (
    <>
      <PageHeader eyebrow="Trace" title={asked ? (asked.length > 80 ? `${asked.slice(0, 80)}...` : asked) : "Run"} subtitle={`${run.status} · ${secs ?? "?"}s · $${Number(run.claude_usd).toFixed(4)} · ${Number(run.tapistro_credits)} Tapistro credits · ${run.input_tokens} in / ${run.output_tokens} out tokens · ${run.model}`} action={<Link href="/agent" className="text-sm text-brand-700 hover:underline">All traces</Link>} />
      <div className="grid gap-4">
        {asked ? <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Asked</div><p className="mt-1 whitespace-pre-wrap text-sm">{asked}</p></Card> : null}
        <ol className="relative grid gap-2">
          {(steps ?? []).map((s) => (
            <li key={s.id} className={`rounded-xl border bg-white p-3 text-sm ${TONE[s.status as string] ?? "border-line"}`}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span><span className="mr-2 text-xs text-ink-400">{s.seq}</span><span className="font-medium">{KIND[s.kind as string] ?? s.kind}</span> <span className="text-ink-600">{s.name}</span></span>
                  <span className="text-xs text-ink-500">{s.duration_ms ? `${s.duration_ms} ms` : ""}{s.cost_usd ? ` · $${Number(s.cost_usd).toFixed(4)}` : ""}{s.credits ? ` · ${Number(s.credits)} credits` : ""}{s.tokens_in ? ` · ${s.tokens_in}/${s.tokens_out} tokens` : ""}{s.status !== "ok" ? ` · ${s.status}` : ""}</span>
                </summary>
                {s.error ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{s.error as string}</p> : null}
                {s.input ? <><div className="mt-3 text-xs font-semibold text-ink-400">Input</div><pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-canvas p-3 text-xs">{JSON.stringify(s.input, null, 2)}</pre></> : null}
                {s.output ? <><div className="mt-3 text-xs font-semibold text-ink-400">Output</div><pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-canvas p-3 text-xs">{JSON.stringify(s.output, null, 2)}</pre></> : null}
              </details>
            </li>
          ))}
        </ol>
        {(msgs ?? []).filter((m) => m.role === "assistant").map((m, i) => <Card key={i} className="p-4"><div className="text-xs font-semibold uppercase tracking-wider text-ink-400">{i === 0 ? "Answer" : "After approval"}</div><p className="mt-1 whitespace-pre-wrap text-sm">{m.content as string}</p></Card>)}
        <p className="text-xs text-ink-400">Phone numbers, personal emails and keys are removed before anything is stored here.</p>
      </div>
    </>
  );
}
