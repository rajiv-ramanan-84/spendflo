import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { USER_PREAMBLE } from "./payload";
import { campaignSystem, classifySystem, REWRITE_SYSTEM } from "./system-prompt";
import type { PlayCode } from "@/lib/playbook/catalog";

/**
 * One Claude call with the skill as a cached system prompt and the output
 * shape enforced by the API (structured outputs) and then re-validated with
 * zod. Invalid output is retried once; after that the caller shows the owner a
 * Retry button (and admins the raw output in a fix box).
 */

export type CallKind = "generate_campaign" | "replan_campaign" | "classify_reply" | "rewrite";

export type ClaudeCallResult<T> =
  | { ok: true; data: T; model: string; usage: Usage; attempts: number; rawText: string }
  | { ok: false; reason: "invalid" | "refusal" | "max_tokens" | "api_error"; message: string; model: string; usage: Usage | null; attempts: number; rawText: string | null };

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; costUsd: number };

/** USD per million tokens. One-hour cache writes bill at 2x input, reads at the listed rate. Batches bill at half. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export function costUsd(model: string, u: Omit<Usage, "costUsd">, opts: { batch?: boolean } = {}): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const usd = ((u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.input * 2) / 1_000_000) * (opts.batch ? 0.5 : 1);
  return Math.round(usd * 10_000) / 10_000;
}

/** Reply sorting is a short, structured task: the small model is plenty. */
export const CLASSIFY_MODEL = "claude-haiku-5-5";

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

const EFFORT: Record<CallKind, "low" | "medium" | "high"> = {
  generate_campaign: "high",
  replan_campaign: "high",
  classify_reply: "low",
  rewrite: "medium",
};

const MAX_TOKENS: Record<CallKind, number> = {
  generate_campaign: 64000,
  replan_campaign: 64000,
  classify_reply: 4000,
  rewrite: 4000,
};

/** The request body for one call, shared by live calls and the overnight batch. */
export function requestParams(kind: CallKind, model: string, skillText: string, payload: unknown, format: ReturnType<typeof zodOutputFormat>, play?: PlayCode | "all" | null) {
  return {
    model,
    max_tokens: MAX_TOKENS[kind],
    system: [{ type: "text" as const, text: kind === "classify_reply" ? classifySystem(skillText) : kind === "rewrite" ? REWRITE_SYSTEM : campaignSystem(skillText, play), cache_control: { type: "ephemeral" as const, ttl: "1h" as const } }],
    output_config: { effort: EFFORT[kind], format },
    messages: [{ role: "user" as const, content: `${USER_PREAMBLE}\n\n${JSON.stringify(payload)}` }],
  };
}

export async function callClaude<S extends z.ZodType>(opts: {
  kind: CallKind;
  model: string;
  skillText: string;
  payload: unknown;
  schema: S;
  play?: PlayCode | "all" | null;
}): Promise<ClaudeCallResult<z.infer<S>>> {
  const { kind, skillText, payload, schema } = opts;
  const model = kind === "classify_reply" ? CLASSIFY_MODEL : opts.model;
  const format = zodOutputFormat(schema);
  let lastText: string | null = null;
  let lastUsage: Usage | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // Streaming keeps long campaign generations clear of HTTP timeouts.
      // Sonnet and Opus fall back to another model if a safety check declines;
      // Haiku has no server-side fallback, so it goes without.
      const params = requestParams(kind, model, skillText, payload, format, opts.play);
      const stream = model.startsWith("claude-haiku")
        ? anthropic().beta.messages.stream(params)
        : anthropic().beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
      const msg = await stream.finalMessage();

      const u = msg.usage;
      const base = {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
      };
      lastUsage = { ...base, costUsd: costUsd(msg.model ?? model, base) };

      if (msg.stop_reason === "refusal") {
        return { ok: false, reason: "refusal", message: msg.stop_details?.explanation ?? "Claude declined this request.", model: msg.model, usage: lastUsage, attempts: attempt, rawText: null };
      }
      if (msg.stop_reason === "max_tokens") {
        return { ok: false, reason: "max_tokens", message: "The plan was cut off before it finished. Retry, or reduce the number of contacts.", model: msg.model, usage: lastUsage, attempts: attempt, rawText: null };
      }

      lastText = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      let json: unknown;
      try {
        json = JSON.parse(lastText);
      } catch {
        continue; // invalid JSON: retry once
      }
      const parsed = schema.safeParse(json);
      if (parsed.success) return { ok: true, data: parsed.data, model: msg.model, usage: lastUsage, attempts: attempt, rawText: lastText };
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
        if (attempt < 2) continue;
      }
      const message = e instanceof Anthropic.APIError ? `Claude API ${e.status}: ${e.message}` : (e as Error).message;
      return { ok: false, reason: "api_error", message, model, usage: lastUsage, attempts: attempt, rawText: lastText };
    }
  }
  return { ok: false, reason: "invalid", message: "Claude returned output that did not match the campaign format twice.", model, usage: lastUsage, attempts: 2, rawText: lastText };
}
