import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, costUsd, requestParams } from "@/lib/claude/client";
import { CampaignSchema } from "@/lib/claude/schemas";
import { finishGenerate, prepareGenerate } from "./generate";
import { assertBudget, draftsAffordable, monthSpend } from "@/lib/claude/budget";

/**
 * Every draft goes through the Message Batches API: half price, and no
 * request ever waits on Claude, so nothing hits the hosting time limit.
 * A click on Generate sends that one account straight away; drafts queued by
 * the sheet sync go out on the next 5-minute run. Results are saved as Drafts
 * as they finish (usually 5 to 10 minutes). Nothing launches on its own.
 */

const MAX_PER_BATCH = 100;
const MAX_ATTEMPTS = 2;

/** Generate button: queue this account and send it now. One draft in flight per account. */
export async function queueDraft(db: SupabaseClient, d: { accountId: string; requestedBy: string | null; ownerNotes?: string | null }) {
  await assertBudget(db, "draft");
  const { data: inFlight } = await db.from("claude_calls").select("id, status, batch_id").eq("call_type", "generate_campaign").eq("account_id", d.accountId).in("status", ["queued", "running"]).limit(1).maybeSingle();
  if (inFlight) {
    // Queued by the sheet sync but not sent yet: a click means now, so send it.
    if (inFlight.status === "queued" && !inFlight.batch_id) {
      try {
        await submitDraftBatch(db, { onlyIds: [inFlight.id as string] });
      } catch (e) {
        console.error("Immediate batch send failed:", e);
      }
    }
    return { callId: inFlight.id as string, already: true };
  }
  const { data: row, error } = await db.from("claude_calls").insert({
    call_type: "generate_campaign", account_id: d.accountId, status: "queued", requested_by: d.requestedBy,
    batch_context: d.ownerNotes ? { ownerNotes: d.ownerNotes } : null,
  }).select("id").single();
  if (error || !row) throw new Error(error?.message ?? "Could not queue the draft");
  try {
    await submitDraftBatch(db, { onlyIds: [row.id] });
  } catch (e) {
    // Still queued: the 5-minute run picks it up.
    console.error("Immediate batch send failed:", e);
  }
  return { callId: row.id as string, already: false };
}

export async function submitDraftBatch(db: SupabaseClient, opts: { onlyIds?: string[] } = {}) {
  let q = db
    .from("claude_calls")
    .select("id, account_id, requested_by, attempts, batch_context")
    .eq("status", "queued")
    .eq("call_type", "generate_campaign")
    .is("batch_id", null)
    .order("created_at", { ascending: true })
    .limit(MAX_PER_BATCH);
  if (opts.onlyIds?.length) q = q.in("id", opts.onlyIds);
  const { data: allQueued } = await q;
  if (!allQueued?.length) return { submitted: 0, skipped: 0, batchId: null };
  // Never send more than this month's budget allows; the rest wait, still queued.
  const affordable = draftsAffordable(await monthSpend(db));
  const queued = allQueued.slice(0, affordable);
  if (!queued.length) return { submitted: 0, skipped: 0, batchId: null, held: allQueued.length };

  const format = zodOutputFormat(CampaignSchema);
  const requests: Array<{ custom_id: string; params: ReturnType<typeof requestParams> }> = [];
  const context = new Map<string, { refIds: string[]; model: string; skillVersionId: string | null; ownerNotes: string | null }>();
  let skipped = 0;

  const seen = new Set<string>();
  for (const q of queued) {
    // One draft per account per batch, however many times it was queued.
    if (seen.has(q.account_id)) {
      await db.from("claude_calls").update({ status: "failed", error: "Already queued for this account" }).eq("id", q.id);
      skipped++;
      continue;
    }
    seen.add(q.account_id);
    const ownerNotes = (q.batch_context as { ownerNotes?: string } | null)?.ownerNotes ?? null;
    const ready = await prepareGenerate(db, { accountId: q.account_id, ownerNotes });
    if (!ready.ok) {
      await db.from("claude_calls").update({ status: "failed", error: ready.error }).eq("id", q.id);
      skipped++;
      continue;
    }
    const { prep } = ready;
    requests.push({ custom_id: q.id, params: requestParams("generate_campaign", prep.model, prep.p.skill.text, prep.payload, format) });
    context.set(q.id, { refIds: [...prep.refs.toId.values()], model: prep.model, skillVersionId: prep.p.skill.id, ownerNotes });
  }
  if (!requests.length) return { submitted: 0, skipped, batchId: null };

  // Claim every row before sending, so a second run can never send the same
  // account twice. If the send fails, the claims are released.
  const ids = [...context.keys()];
  const { data: claimed, error: claimErr } = await db.from("claude_calls").update({ status: "running" }).in("id", ids).eq("status", "queued").is("batch_id", null).select("id");
  if (claimErr) throw new Error(`Could not claim queued drafts: ${claimErr.message}`);
  const mine = new Set((claimed ?? []).map((r) => r.id));
  const send = requests.filter((r) => mine.has(r.custom_id));
  if (!send.length) return { submitted: 0, skipped, batchId: null };

  let batch;
  try {
    batch = await anthropic().messages.batches.create({ requests: send });
  } catch (e) {
    await db.from("claude_calls").update({ status: "queued" }).in("id", [...mine]);
    throw e;
  }
  for (const id of mine) {
    const c = context.get(id)!;
    const { error } = await db.from("claude_calls").update({
      batch_id: batch.id, model: c.model, skill_version_id: c.skillVersionId,
      batch_context: { refIds: c.refIds, ownerNotes: c.ownerNotes }, attempts: (queued.find((q) => q.id === id)?.attempts ?? 0) + 1,
    }).eq("id", id);
    if (error) throw new Error(`Batch ${batch.id} sent but could not be recorded: ${error.message}`);
  }
  return { submitted: send.length, skipped, batchId: batch.id };
}

/** Saves finished batch results as Drafts. Safe to call often; does nothing until a batch ends. */
export async function collectDraftBatches(db: SupabaseClient) {
  const { data: running } = await db.from("claude_calls").select("id, account_id, requested_by, attempts, batch_id, batch_context, model").eq("status", "running").not("batch_id", "is", null);
  const byBatch = new Map<string, NonNullable<typeof running>>();
  for (const r of running ?? []) byBatch.set(r.batch_id!, [...(byBatch.get(r.batch_id!) ?? []), r]);

  const summary = { batchesEnded: 0, drafts: 0, failed: 0, requeued: 0, costUsd: 0 };
  for (const [batchId, rows] of byBatch) {
    const batch = await anthropic().messages.batches.retrieve(batchId);
    if (batch.processing_status !== "ended") continue;
    summary.batchesEnded++;
    const rowById = new Map(rows.map((r) => [r.id, r]));

    for await (const item of await anthropic().messages.batches.results(batchId)) {
      const row = rowById.get(item.custom_id);
      if (!row) continue;
      rowById.delete(item.custom_id);

      if (item.result.type !== "succeeded") {
        // Errored or expired: try again next night, then give up with a reason.
        const again = (row.attempts ?? 1) < MAX_ATTEMPTS;
        await db.from("claude_calls").update(again
          ? { status: "queued", batch_id: null, error: `Batch ${item.result.type}; retrying tonight` }
          : { status: "failed", error: `Batch ${item.result.type} twice. Generate it from the account page.` }).eq("id", row.id);
        if (again) summary.requeued++; else summary.failed++;
        continue;
      }

      const msg = item.result.message;
      const usage = { input: msg.usage.input_tokens ?? 0, output: msg.usage.output_tokens ?? 0, cacheRead: msg.usage.cache_read_input_tokens ?? 0, cacheWrite: msg.usage.cache_creation_input_tokens ?? 0 };
      const cost = costUsd(msg.model, usage, { batch: true });
      summary.costUsd += cost;
      const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      const base = { model: msg.model, input_tokens: usage.input, output_tokens: usage.output, cache_read_tokens: usage.cacheRead, cost_usd: cost, raw_output: text };

      let parsed: ReturnType<typeof CampaignSchema.safeParse> | null = null;
      try {
        parsed = CampaignSchema.safeParse(JSON.parse(text));
      } catch {
        parsed = null;
      }
      if (msg.stop_reason !== "end_turn" || !parsed?.success) {
        const why = msg.stop_reason === "refusal" ? "Claude declined this account" : msg.stop_reason === "max_tokens" ? "The plan was cut off" : "The plan did not match the format";
        await db.from("claude_calls").update({ ...base, status: msg.stop_reason === "refusal" ? "failed" : "invalid", error: `${why}. Generate it from the account page.` }).eq("id", row.id);
        summary.failed++;
        continue;
      }

      // Re-check the account now: someone may have generated or launched it during the night.
      const refIds = (row.batch_context as { refIds?: string[] } | null)?.refIds;
      const ready = await prepareGenerate(db, { accountId: row.account_id, refIds });
      if (!ready.ok) {
        await db.from("claude_calls").update({ ...base, status: "failed", error: `Not saved: ${ready.error}` }).eq("id", row.id);
        summary.failed++;
        continue;
      }
      await db.from("claude_calls").update({ ...base, status: "ok", error: null }).eq("id", row.id);
      await finishGenerate(db, ready.prep, parsed.data, { model: msg.model, callId: row.id, requestedBy: row.requested_by });
      summary.drafts++;
      // Badge for whoever asked, or the owner for drafts queued by the sync.
      const notify = row.requested_by ?? (ready.prep.account.owner_id as string | null);
      if (notify) await db.from("notifications").insert({ user_id: notify, type: "draft_ready", entity_type: "account", entity_id: row.account_id, message: `Draft ready: ${ready.prep.account.name as string}` });
    }
    // Anything the batch did not return goes back in the queue.
    for (const row of rowById.values()) {
      await db.from("claude_calls").update({ status: "queued", batch_id: null, error: "Missing from batch results; retrying tonight" }).eq("id", row.id);
      summary.requeued++;
    }
  }
  summary.costUsd = Math.round(summary.costUsd * 10_000) / 10_000;
  return summary;
}
