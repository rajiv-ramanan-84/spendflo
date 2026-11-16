import { z } from "zod";

/** Assistant settings, kept as versioned configuration (admins edit them in Settings). Pure. */

export const AgentConfigSchema = z.object({
  enabled: z.boolean(),
  model: z.enum(["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"]),
  claudeMonthlyUsd: z.number().min(0).max(100000),
  tapistroMonthlyCredits: z.number().min(0).max(10000000),
  runCapUsd: z.number().min(0.05).max(1000),
  runCapCredits: z.number().min(0).max(100000),
  warnPct: z.number().min(10).max(99),
  maxTurns: z.number().int().min(1).max(20),
  maxToolOutputChars: z.number().int().min(1000).max(60000),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  model: "claude-sonnet-5-5",
  claudeMonthlyUsd: 50,
  tapistroMonthlyCredits: 500,
  runCapUsd: 3,
  runCapCredits: 100,
  warnPct: 80,
  maxTurns: 8,
  maxToolOutputChars: 12000,
};

/** Merges stored values over the defaults, ignoring anything that no longer validates. */
export function parseAgentConfig(stored: unknown): AgentConfig {
  const merged = { ...DEFAULT_AGENT_CONFIG, ...(stored && typeof stored === "object" ? (stored as object) : {}) };
  const r = AgentConfigSchema.safeParse(merged);
  return r.success ? r.data : DEFAULT_AGENT_CONFIG;
}

// ---------------------------------------------------------------------------
// Budget rules
// ---------------------------------------------------------------------------

export type Totals = { usd: number; credits: number };
export type BudgetState = "ok" | "warn" | "stop";

export function stateOf(spent: number, cap: number, warnPct: number): BudgetState {
  if (cap <= 0) return spent > 0 ? "stop" : "stop";
  if (spent >= cap) return "stop";
  return spent >= (cap * warnPct) / 100 ? "warn" : "ok";
}

export type Gate = { ok: true; warn: string | null } | { ok: false; reason: string };

/**
 * Can this step go ahead? `month` is what has been spent this month, `run` what this run has spent,
 * `next` what the step is expected to cost. The step is refused if it would pass a cap.
 */
export function gate(cfg: AgentConfig, month: Totals, run: Totals, next: Partial<Totals> = {}): Gate {
  if (!cfg.enabled) return { ok: false, reason: "The assistant is switched off in Settings." };
  const nu = next.usd ?? 0, nc = next.credits ?? 0;
  if (month.usd + nu > cfg.claudeMonthlyUsd) return { ok: false, reason: `This month's assistant Claude budget ($${cfg.claudeMonthlyUsd}) is used up. An admin can raise it in Settings > Assistant.` };
  if (month.credits + nc > cfg.tapistroMonthlyCredits) return { ok: false, reason: `This month's Tapistro credits (${cfg.tapistroMonthlyCredits}) are used up. An admin can raise them in Settings > Assistant.` };
  if (run.usd + nu > cfg.runCapUsd) return { ok: false, reason: `This request reached its $${cfg.runCapUsd} limit. Ask for something narrower, or an admin can raise the per-request limit.` };
  if (run.credits + nc > cfg.runCapCredits) return { ok: false, reason: `This request would use more than ${cfg.runCapCredits} Tapistro credits. Ask for something narrower, or an admin can raise the per-request limit.` };
  const w = [stateOf(month.usd + nu, cfg.claudeMonthlyUsd, cfg.warnPct) === "warn" ? `Claude budget is past ${cfg.warnPct}%` : null, stateOf(month.credits + nc, cfg.tapistroMonthlyCredits, cfg.warnPct) === "warn" ? `Tapistro credits are past ${cfg.warnPct}%` : null].filter(Boolean);
  return { ok: true, warn: w.length ? w.join(". ") : null };
}
