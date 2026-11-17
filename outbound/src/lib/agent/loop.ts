import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { anthropic, costUsd } from "@/lib/claude/call";
import { todayIn } from "@/lib/calendar/dates";
import { gate, type AgentConfig, type Totals } from "./config";
import { forModel } from "./redact";
import { Tracer, loadAgentConfig, monthTotals } from "./store";
import { BUILTIN_TOOLS, jsonSchemaOf, type AgentTool } from "./tools";
import { activeIntegrationTools, runIntegrationTool, type IntegrationTool } from "./integrations";
import { proposeAction } from "./actions";
import { systemPrompt } from "./system";
import { inputCostUsd } from "@/lib/claude/pricing";
import type { Attachments } from "./attachments";

export type AgentEvent =
  | { type: "run"; runId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; status: "start" | "ok" | "error" | "blocked"; ms?: number }
  | { type: "action"; actionId: string; title: string; estCredits: number; summary?: string }
  | { type: "warn"; text: string }
  | { type: "done"; usd: number; credits: number; status: string }
  | { type: "error"; message: string };

const safeName = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
const MODEL_STEP_ESTIMATE_USD = 0.05;

type Registered = { builtin?: AgentTool; integration?: IntegrationTool };

export async function runAgent(d: {
  db: SupabaseClient;
  user: SessionUser;
  threadId: string;
  text: string;
  page: string | null;
  accountName: string | null;
  attachments?: Attachments | null;
  emit: (e: AgentEvent) => void;
  signal?: AbortSignal;
}) {
  const { db, user, threadId, emit } = d;
  const cfg: AgentConfig = await loadAgentConfig(db);
  const month: Totals = await monthTotals(db);
  const tracer = await Tracer.start(db, { threadId, userId: user.id!, model: cfg.model });
  emit({ type: "run", runId: tracer.runId });

  const finish = async (status: "done" | "failed" | "stopped" | "budget", summary: string | null, error?: string) => {
    await tracer.finish(status, summary, error);
    emit({ type: "done", usd: Math.round(tracer.usd * 10000) / 10000, credits: tracer.credits, status });
  };

  const attachUsd = d.attachments ? inputCostUsd(cfg.model, d.attachments.estTokens) : 0;
  const first = gate(cfg, month, { usd: 0, credits: 0 }, { usd: MODEL_STEP_ESTIMATE_USD + attachUsd });
  if (!first.ok) {
    await tracer.step({ kind: "guard", name: "budget", status: "blocked", error: first.reason });
    await db.from("agent_messages").insert({ thread_id: threadId, role: "user", content: d.text, run_id: tracer.runId, meta: d.attachments?.meta ?? null });
    await db.from("agent_messages").insert({ thread_id: threadId, role: "assistant", content: first.reason, run_id: tracer.runId });
    emit({ type: "text", delta: first.reason });
    await finish("budget", first.reason);
    return;
  }
  if (first.warn) emit({ type: "warn", text: first.warn });

  // Tools: the built-in reads, plus any integration tool that has been reviewed and switched on.
  const registry = new Map<string, Registered>();
  const defs: Anthropic.Tool[] = [];
  for (const t of BUILTIN_TOOLS) {
    registry.set(t.name, { builtin: t });
    defs.push({ name: t.name, description: t.description, input_schema: jsonSchemaOf(t) as Anthropic.Tool.InputSchema });
  }
  for (const t of await activeIntegrationTools(db)) {
    const n = safeName(t.fullName);
    registry.set(n, { integration: t });
    defs.push({ name: n, description: `[${t.integrationName}${t.level === "approve" ? ", needs approval" : ""}] ${t.description}`.slice(0, 1000), input_schema: (t.schema as Anthropic.Tool.InputSchema) ?? { type: "object", properties: {} } });
  }

  const { data: hist } = await db.from("agent_messages").select("role, content, meta").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(16);
  const messages: Anthropic.MessageParam[] = [...(hist ?? [])].reverse().map((m) => {
    const files = ((m.meta as { files?: Array<{ id: string; name: string }> } | null)?.files ?? []);
    return { role: m.role as "user" | "assistant", content: `${m.content as string}${files.length ? `\n\n(Attached earlier: ${files.map((f) => `${f.name} [file_id=${f.id}]`).join(", ")}. Use read_attached_file to read it again.)` : ""}` };
  });
  messages.push({ role: "user", content: d.attachments ? [{ type: "text", text: d.text }, { type: "text", text: d.attachments.text }] : d.text });
  await db.from("agent_messages").insert({ thread_id: threadId, role: "user", content: d.text, run_id: tracer.runId, meta: d.attachments?.meta ?? null });
  if (d.attachments) await tracer.step({ kind: "tool", name: "attach_context", output: { accounts: d.attachments.meta.contexts.map((c) => c.label), files: d.attachments.meta.files.map((f) => ({ name: f.name, chars: f.chars })), approx_size: d.attachments.estTokens } });
  const { data: th } = await db.from("agent_threads").select("title").eq("id", threadId).single();
  if (th?.title === "New chat") await db.from("agent_threads").update({ title: d.text.slice(0, 60) }).eq("id", threadId);
  await db.from("agent_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);

  const system = [{ type: "text" as const, text: systemPrompt({ today: todayIn(), userName: user.name, role: user.role, page: d.page, accountName: d.accountName }) }];
  let finalText = "";
  let guardStop: string | null = null;

  try {
    for (let turn = 1; turn <= cfg.maxTurns; turn++) {
      if (d.signal?.aborted) { await finish("stopped", finalText || null); return; }
      const g = gate(cfg, { usd: month.usd + tracer.usd, credits: month.credits + tracer.credits }, { usd: tracer.usd, credits: tracer.credits }, { usd: MODEL_STEP_ESTIMATE_USD });
      if (!g.ok) { guardStop = g.reason; await tracer.step({ kind: "guard", name: "budget", status: "blocked", error: g.reason }); break; }

      const t0 = Date.now();
      const stream = anthropic().messages.stream({ model: cfg.model, max_tokens: 4096, system, tools: defs, messages });
      stream.on("text", (delta) => { finalText += delta; emit({ type: "text", delta }); });
      const msg = await stream.finalMessage();
      const u = msg.usage;
      const usage = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
      await tracer.step({ kind: "model", name: `${cfg.model} turn ${turn}`, tokensIn: usage.input + usage.cacheRead + usage.cacheWrite, tokensOut: usage.output, costUsd: costUsd(msg.model ?? cfg.model, usage), durationMs: Date.now() - t0, output: { stop_reason: msg.stop_reason, tools: msg.content.filter((b) => b.type === "tool_use").map((b) => (b.type === "tool_use" ? b.name : "")) } });

      const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason !== "tool_use" || !uses.length) break;

      messages.push({ role: "assistant", content: msg.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of uses) {
        const reg = registry.get(use.name);
        const input = (use.input ?? {}) as Record<string, unknown>;
        if (!reg) {
          await tracer.step({ kind: "tool", name: use.name, status: "blocked", input, error: "Unknown or switched-off tool" });
          emit({ type: "tool", name: use.name, status: "blocked" });
          results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: "That tool is not available." });
          continue;
        }
        emit({ type: "tool", name: use.name, status: "start" });
        const ts = Date.now();
        try {
          if (reg.builtin) {
            const parsed = reg.builtin.schema.safeParse(input);
            if (!parsed.success) throw new Error(`Bad arguments: ${parsed.error.issues[0]?.message}`);
            const run = { runId: tracer.runId, threadId, onAction: (x: { id: string; title: string; summary: string; settingId: string; input: unknown }) => { emit({ type: "action", actionId: x.id, title: x.title, estCredits: 0, summary: x.summary }); void tracer.step({ kind: "approval", name: `setting: ${x.settingId}`, status: "pending", input: x.input, output: { actionId: x.id } }); } };
            const out = await reg.builtin.run({ db, user, cfg, run }, parsed.data as never);
            await tracer.step({ kind: "tool", name: use.name, input, output: out, durationMs: Date.now() - ts });
            results.push({ type: "tool_result", tool_use_id: use.id, content: forModel(out, cfg.maxToolOutputChars) });
            emit({ type: "tool", name: use.name, status: "ok", ms: Date.now() - ts });
            continue;
          }
          const it = reg.integration!;
          const gc = gate(cfg, { usd: month.usd + tracer.usd, credits: month.credits + tracer.credits }, { usd: tracer.usd, credits: tracer.credits }, { credits: it.credits });
          if (!gc.ok) {
            await tracer.step({ kind: "guard", name: use.name, status: "blocked", error: gc.reason });
            emit({ type: "tool", name: use.name, status: "blocked" });
            results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: gc.reason });
            continue;
          }
          if (it.level === "approve") {
            const p = await proposeAction(db, { runId: tracer.runId, threadId, userId: user.id!, tool: it, args: input });
            await tracer.step({ kind: "approval", name: it.fullName, status: "pending", input, output: { actionId: p.id, estCredits: it.credits } });
            emit({ type: "action", actionId: p.id, title: p.title, estCredits: it.credits });
            results.push({ type: "tool_result", tool_use_id: use.id, content: `Not run yet. This needs the person's approval and is shown to them as a card (about ${it.credits} credits). Tell them it is waiting.` });
            continue;
          }
          const r = await runIntegrationTool(db, it.integrationId, it.name, input);
          await tracer.step({ kind: "tool", name: it.fullName, status: r.isError ? "error" : "ok", input, output: r.content, credits: r.isError ? 0 : it.credits, durationMs: Date.now() - ts });
          results.push({ type: "tool_result", tool_use_id: use.id, is_error: r.isError, content: forModel(r.content, cfg.maxToolOutputChars) });
          emit({ type: "tool", name: use.name, status: r.isError ? "error" : "ok", ms: Date.now() - ts });
        } catch (e) {
          const m = e instanceof Error ? e.message : "Tool failed";
          await tracer.step({ kind: "tool", name: use.name, status: "error", input, error: m, durationMs: Date.now() - ts });
          emit({ type: "tool", name: use.name, status: "error" });
          results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: m.slice(0, 500) });
        }
      }
      messages.push({ role: "user", content: results });
    }

    if (guardStop) { finalText = `${finalText}${finalText ? "\n\n" : ""}${guardStop}`; emit({ type: "text", delta: `${finalText === guardStop ? "" : "\n\n"}${guardStop}` }); }
    if (!finalText.trim()) { finalText = "I could not finish that. Try asking in a narrower way."; emit({ type: "text", delta: finalText }); }
    await db.from("agent_messages").insert({ thread_id: threadId, role: "assistant", content: finalText, run_id: tracer.runId });
    await finish(guardStop ? "budget" : "done", finalText);
  } catch (e) {
    const m = e instanceof Error ? e.message : "Something went wrong";
    await tracer.step({ kind: "error", name: "run", status: "error", error: m });
    emit({ type: "error", message: "Something went wrong. Please try again." });
    await finish("failed", null, m);
  }
}
