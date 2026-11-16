import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { canEditAdminSettings } from "@/lib/auth/session";
import { ActionError } from "@/lib/campaigns/actions";
import { logActivity } from "@/lib/activity/log";
import { redactValue } from "./redact";
import { AgentConfigSchema, DEFAULT_AGENT_CONFIG, parseAgentConfig, type AgentConfig, type Totals } from "./config";

const CONFIG_ENTITY = "00000000-0000-4000-8000-0000000000a1";

export async function loadAgentConfig(db: SupabaseClient): Promise<AgentConfig> {
  const { data } = await db.from("agent_config").select("value").eq("key", "assistant").order("version_no", { ascending: false }).limit(1).maybeSingle();
  return parseAgentConfig(data?.value);
}

/** Admin only. Every save is a new version and is logged with what changed. */
export async function saveAgentConfig(db: SupabaseClient, user: SessionUser, patch: Partial<AgentConfig>) {
  if (!canEditAdminSettings(user)) throw new ActionError("Only admins can change assistant settings", 403);
  const before = await loadAgentConfig(db);
  const next = { ...before, ...patch };
  const parsed = AgentConfigSchema.safeParse(next);
  if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Check the values");
  const { data: last } = await db.from("agent_config").select("version_no").eq("key", "assistant").order("version_no", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("agent_config").insert({ key: "assistant", version_no: (last?.version_no ?? 0) + 1, value: parsed.data, edited_by: user.id });
  if (error) throw new ActionError(error.message, 500);
  const changed = Object.fromEntries(Object.entries(parsed.data).filter(([k, v]) => (before as Record<string, unknown>)[k] !== v));
  await logActivity(db, { entityType: "agent_config", entityId: CONFIG_ENTITY, action: "changed", actorId: user.id, before: Object.fromEntries(Object.keys(changed).map((k) => [k, (before as Record<string, unknown>)[k]])), after: changed });
  return parsed.data;
}

export const monthStartIso = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

/** What the assistant has spent this month, from the ledger. */
export async function monthTotals(db: SupabaseClient, now = new Date()): Promise<Totals> {
  const { data } = await db.from("spend_ledger").select("kind, amount").gte("at", monthStartIso(now));
  let usd = 0, credits = 0;
  for (const r of data ?? []) {
    if (r.kind === "claude_usd") usd += Number(r.amount);
    else credits += Number(r.amount);
  }
  return { usd: Math.round(usd * 10000) / 10000, credits: Math.round(credits * 100) / 100 };
}

export { DEFAULT_AGENT_CONFIG };

// ---------------------------------------------------------------------------
// Runs and traces
// ---------------------------------------------------------------------------

export type StepInput = {
  kind: "model" | "tool" | "approval" | "action" | "guard" | "error";
  name: string;
  status?: "ok" | "error" | "blocked" | "pending";
  input?: unknown;
  output?: unknown;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  credits?: number;
  durationMs?: number;
  error?: string | null;
};

const clip = (v: unknown, max = 20000) => {
  const red = redactValue(v ?? null);
  const s = JSON.stringify(red);
  return s.length <= max ? red : { truncated: true, preview: s.slice(0, max) };
};

/** Records one run: each step as it happens, the money it spent, and how it ended. */
export class Tracer {
  private seq = 0;
  usd = 0;
  credits = 0;
  tokensIn = 0;
  tokensOut = 0;
  constructor(private db: SupabaseClient, readonly runId: string) {}

  static async start(db: SupabaseClient, d: { threadId: string; userId: string; model: string }) {
    const { data, error } = await db.from("agent_runs").insert({ thread_id: d.threadId, user_id: d.userId, model: d.model }).select("id").single();
    if (error || !data) throw new Error(`Could not start a run: ${error?.message}`);
    return new Tracer(db, data.id as string);
  }

  /** Continues a finished run, for what happens after a person approves an action. */
  static async attach(db: SupabaseClient, runId: string) {
    const t = new Tracer(db, runId);
    const { data } = await db.from("agent_steps").select("seq").eq("run_id", runId).order("seq", { ascending: false }).limit(1).maybeSingle();
    t.seq = (data?.seq as number | undefined) ?? 0;
    return t;
  }

  async step(s: StepInput) {
    this.seq += 1;
    if (s.costUsd) this.usd += s.costUsd;
    if (s.credits) this.credits += s.credits;
    this.tokensIn += s.tokensIn ?? 0;
    this.tokensOut += s.tokensOut ?? 0;
    const { error } = await this.db.from("agent_steps").insert({
      run_id: this.runId, seq: this.seq, kind: s.kind, name: s.name, status: s.status ?? "ok",
      input: s.input === undefined ? null : clip(s.input), output: s.output === undefined ? null : clip(s.output),
      tokens_in: s.tokensIn ?? null, tokens_out: s.tokensOut ?? null, cost_usd: s.costUsd ?? null, credits: s.credits ?? null,
      duration_ms: s.durationMs ?? null, error: s.error ? String(s.error).slice(0, 2000) : null,
    });
    if (error) console.error("agent_steps insert failed:", error.message);
    if (s.costUsd) await this.db.from("spend_ledger").insert({ run_id: this.runId, kind: "claude_usd", amount: s.costUsd, note: s.name });
    if (s.credits) await this.db.from("spend_ledger").insert({ run_id: this.runId, kind: "tapistro_credits", amount: s.credits, note: s.name });
  }

  async finish(status: "done" | "failed" | "stopped" | "budget", summary: string | null, error?: string | null) {
    await this.db.from("agent_runs").update({
      status, summary: summary?.slice(0, 500) ?? null, error: error?.slice(0, 1000) ?? null,
      claude_usd: Math.round(this.usd * 10000) / 10000, tapistro_credits: Math.round(this.credits * 100) / 100,
      input_tokens: this.tokensIn, output_tokens: this.tokensOut, finished_at: new Date().toISOString(),
    }).eq("id", this.runId);
  }
}
