import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { canAssignAccounts } from "@/lib/auth/session";
import { ActionError } from "@/lib/campaigns/actions";
import { logActivity } from "@/lib/activity/log";
import { forModel, redactValue } from "./redact";
import { gate } from "./config";
import { Tracer, loadAgentConfig, monthTotals } from "./store";
import { runIntegrationTool, type IntegrationTool } from "./integrations";

/**
 * Anything that changes something or spends credits is proposed first and runs only when a person approves.
 * The assistant can propose. It can never approve.
 */

export async function proposeAction(db: SupabaseClient, d: { runId: string; threadId: string; userId: string; tool: IntegrationTool; args: Record<string, unknown> }) {
  const title = `${d.tool.integrationName}: ${d.tool.name.replace(/_/g, " ")}`;
  const { data, error } = await db.from("agent_actions").insert({ run_id: d.runId, thread_id: d.threadId, proposed_by: d.userId, kind: "mcp_tool", integration_id: d.tool.integrationId, tool: d.tool.name, title, args: d.args, est_credits: d.tool.credits }).select("id").single();
  if (error || !data) throw new Error(`Could not save the proposal: ${error?.message}`);
  await logActivity(db, { entityType: "agent_action", entityId: data.id, action: "proposed", actorId: d.userId, after: { title, tool: d.tool.name, estCredits: d.tool.credits } });
  return { id: data.id as string, title };
}

export async function decideAction(db: SupabaseClient, user: SessionUser, actionId: string, approve: boolean) {
  const { data: a } = await db.from("agent_actions").select("*").eq("id", actionId).maybeSingle();
  if (!a) throw new ActionError("Action not found", 404);
  if (a.status !== "proposed") throw new ActionError("This action was already decided");
  if (a.proposed_by !== user.id && !canAssignAccounts(user)) throw new ActionError("Only the person who asked, a manager or an admin can decide this", 403);
  const now = new Date().toISOString();

  if (!approve) {
    await db.from("agent_actions").update({ status: "rejected", decided_by: user.id, decided_at: now }).eq("id", actionId);
    await logActivity(db, { entityType: "agent_action", entityId: actionId, action: "rejected", actorId: user.id, after: { title: a.title } });
    return { status: "rejected" as const };
  }

  const cfg = await loadAgentConfig(db);
  const month = await monthTotals(db);
  const g = gate(cfg, month, { usd: 0, credits: 0 }, { credits: Number(a.est_credits) });
  if (!g.ok) throw new ActionError(g.reason, 402);

  await db.from("agent_actions").update({ status: "approved", decided_by: user.id, decided_at: now }).eq("id", actionId);
  await logActivity(db, { entityType: "agent_action", entityId: actionId, action: "approved", actorId: user.id, after: { title: a.title, args: redactValue(a.args) } });
  const tracer = a.run_id ? await Tracer.attach(db, a.run_id as string) : null;
  const t0 = Date.now();
  try {
    const r = await runIntegrationTool(db, a.integration_id as string, a.tool as string, a.args as Record<string, unknown>);
    const result = redactValue(r.content);
    const credits = Number(a.est_credits);
    await db.from("agent_actions").update({ status: r.isError ? "failed" : "executed", result, error: r.isError ? forModel(r.content, 500) : null }).eq("id", actionId);
    await tracer?.step({ kind: "action", name: `${a.tool} (approved)`, status: r.isError ? "error" : "ok", input: a.args, output: r.content, credits: r.isError ? 0 : credits, durationMs: Date.now() - t0 });
    if (a.run_id && credits && !r.isError) {
      const { data: run } = await db.from("agent_runs").select("tapistro_credits").eq("id", a.run_id).single();
      await db.from("agent_runs").update({ tapistro_credits: Number(run?.tapistro_credits ?? 0) + credits }).eq("id", a.run_id);
    }
    await logActivity(db, { entityType: "agent_action", entityId: actionId, action: r.isError ? "failed" : "executed", actorId: user.id, after: { title: a.title, credits } });
    if (a.thread_id) await db.from("agent_messages").insert({ thread_id: a.thread_id, role: "assistant", run_id: a.run_id, content: `${r.isError ? "That failed" : "Done"}: ${a.title}.\n${forModel(r.content, 3000)}` });
    return { status: r.isError ? ("failed" as const) : ("executed" as const), result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "The tool call failed";
    await db.from("agent_actions").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", actionId);
    await tracer?.step({ kind: "action", name: `${a.tool} (approved)`, status: "error", input: a.args, error: msg, durationMs: Date.now() - t0 });
    throw new ActionError(`The action failed: ${msg}`, 502);
  }
}
