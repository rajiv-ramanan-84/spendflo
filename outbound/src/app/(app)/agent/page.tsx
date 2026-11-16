import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { canAssignAccounts, requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CHIP: Record<string, string> = { done: "bg-emerald-50 text-emerald-700", running: "bg-sky-50 text-sky-700", failed: "bg-rose-50 text-rose-700", stopped: "bg-canvas text-ink-500", budget: "bg-amber-50 text-amber-800" };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function AgentTracesPage() {
  const user = await requireUser();
  const db = supabaseAdmin();
  if (!db || !user.id) return null;
  const seeAll = canAssignAccounts(user);
  let q = db.from("agent_runs").select("id, status, claude_usd, tapistro_credits, summary, started_at, user_id, thread_id, error").order("started_at", { ascending: false }).limit(60);
  if (!seeAll) q = q.eq("user_id", user.id);
  const { data: runs } = await q;
  const [{ data: people }, { data: threads }, { data: audit }] = await Promise.all([
    db.from("users").select("id, name").in("id", [...new Set((runs ?? []).map((r) => r.user_id as string))]),
    db.from("agent_threads").select("id, title").in("id", [...new Set((runs ?? []).map((r) => r.thread_id as string))]),
    seeAll ? db.from("activity_log").select("id, entity_type, action, actor_id, after, at").in("entity_type", ["agent_action", "integration", "agent_config"]).order("id", { ascending: false }).limit(40) : Promise.resolve({ data: [] as Array<{ id: number; entity_type: string; action: string; actor_id: string | null; after: unknown; at: string }> }),
  ]);
  const { data: actors } = await db.from("users").select("id, name").in("id", [...new Set((audit ?? []).map((a) => a.actor_id as string).filter(Boolean))]);
  const pn = new Map([...(people ?? []), ...(actors ?? [])].map((p) => [p.id as string, p.name as string]));
  const tn = new Map((threads ?? []).map((t) => [t.id as string, t.title as string]));
  const totalUsd = (runs ?? []).reduce((s, r) => s + Number(r.claude_usd), 0);
  const totalCredits = (runs ?? []).reduce((s, r) => s + Number(r.tapistro_credits), 0);

  return (
    <>
      <PageHeader title="Assistant traces" subtitle={`${seeAll ? "Every run by the team" : "Your runs"}: what it did, step by step, and what it cost. Last ${runs?.length ?? 0} shown: $${totalUsd.toFixed(2)} and ${totalCredits} Tapistro credits.`} />
      <div className="grid gap-5">
        <Card className="overflow-hidden">
          {(runs ?? []).length === 0 ? <p className="p-6 text-sm text-ink-500">No runs yet. Open the assistant from any page and ask something.</p> : (
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs text-ink-500"><tr><th className="px-4 py-2.5">When</th>{seeAll ? <th className="px-4 py-2.5">Who</th> : null}<th className="px-4 py-2.5">Chat</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Claude</th><th className="px-4 py-2.5 text-right">Credits</th></tr></thead>
              <tbody className="divide-y divide-line">
                {(runs ?? []).map((r) => (
                  <tr key={r.id} className="hover:bg-canvas/60">
                    <td className="whitespace-nowrap px-4 py-2.5"><Link href={`/agent/runs/${r.id}`} className="font-medium text-brand-700 hover:underline">{when(r.started_at as string)}</Link></td>
                    {seeAll ? <td className="px-4 py-2.5">{pn.get(r.user_id as string) ?? ""}</td> : null}
                    <td className="max-w-[320px] truncate px-4 py-2.5 text-ink-600">{tn.get(r.thread_id as string) ?? ""}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[r.status as string] ?? CHIP.stopped}`}>{r.status}</span></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">${Number(r.claude_usd).toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{Number(r.tapistro_credits) || "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {seeAll ? (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Audit log</h2>
            <p className="mt-0.5 text-sm text-ink-500">What the assistant proposed, what people approved, and every change to its settings and integrations. This log cannot be edited.</p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {(audit ?? []).length === 0 ? <li className="py-3 text-ink-500">Nothing yet.</li> : (audit ?? []).map((a) => {
                const after = (a.after ?? {}) as Record<string, unknown>;
                const what = typeof after.title === "string" ? after.title : typeof after.tool === "string" ? `${after.tool}` : Object.keys(after).slice(0, 3).join(", ");
                return (
                  <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span><span className="font-medium">{(a.entity_type as string).replace("agent_", "")} {(a.action as string).replace("_", " ")}</span>{what ? <span className="text-ink-500"> · {what}</span> : null}</span>
                    <span className="text-xs text-ink-400">{a.actor_id ? pn.get(a.actor_id as string) ?? "" : "system"} · {when(a.at as string)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
