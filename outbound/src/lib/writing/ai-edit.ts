import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionError, stepForEditing } from "@/lib/campaigns/actions";
import { loadPlanningContext, writingFor, styleFor, focusFor } from "@/lib/campaigns/context";
import type { SessionUser } from "@/lib/auth/session";
import { assertBudget } from "@/lib/claude/budget";
import { callClaude } from "@/lib/claude/call";
import { quoteData } from "@/lib/claude/payload";
import { RewriteSchema } from "@/lib/claude/schemas";
import { copyIssues } from "@/lib/claude/copy-checks";
import { emailChecks, firstNameOf } from "./compose";
import { finishStep } from "./finish";
import { loadSigners } from "./rules";

/**
 * Edit with AI: one message, one instruction, one proposal. Nothing is saved here.
 * The owner sees the new version beside the old one and keeps or discards it.
 */
export async function proposeEdit(db: SupabaseClient, user: SessionUser, stepId: string, instruction: string, current?: { subject?: string | null; body?: string }) {
  const ask = instruction.trim();
  if (ask.length < 3) throw new ActionError("Tell me what to change, for example \"shorter\" or \"open with the acquisition\".");
  if (ask.length > 1000) throw new ActionError("Keep the instruction under 1,000 characters.");
  const { step, campaign } = await stepForEditing(db, user, stepId);
  if (step.channel === "call") throw new ActionError("Edit with AI works on emails and LinkedIn messages. Call scripts are edited by hand.");
  // Edit what is on screen, which can be ahead of what has autosaved.
  const text = (current?.body ?? step.body ?? "").trim();
  const subjectNow = current?.subject ?? step.subject ?? null;
  if (!text) throw new ActionError("This step has no message yet.");
  await assertBudget(db, "re-plan");

  const [{ data: contact }, { data: account }, p] = await Promise.all([
    db.from("contacts").select("full_name, title, persona").eq("id", step.contact_id).maybeSingle(),
    db.from("accounts").select("name, trigger, signals, outreach_angle").eq("id", campaign.account_id).maybeSingle(),
    loadPlanningContext(db),
  ]);
  const assignee = p.users.find((u) => u.id === (step.assignee_id ?? campaign.owner_id));
  if (!assignee) throw new ActionError("This step has no sender yet.");
  const signers = await loadSigners(db, [assignee.id]);
  const isEmail = step.channel === "email";
  const first = firstNameOf(contact?.full_name as string | undefined);
  // Edit the message as the reader sees it, minus the greeting and signature the app adds.
  const writing = writingFor(p, assignee, [contact?.persona as string | null]);

  const res = await callClaude({
    kind: "rewrite", model: p.settings.default_model, skillText: "", schema: RewriteSchema,
    payload: {
      call: "rewrite",
      instruction: ask,
      channel: step.channel,
      message: { subject: subjectNow, body: text },
      to: { name: contact?.full_name ?? null, title: contact?.title ?? null, persona: contact?.persona ?? null },
      account: { name: account?.name ?? null, trigger: account?.trigger ?? null, signals: quoteData(String(account?.signals ?? "").slice(0, 1500)), angle: account?.outreach_angle ?? null },
      play: campaign.play ?? null,
      outreach_style: styleFor(p, assignee),
      validation_focus: styleFor(p, assignee) === "founder" ? focusFor(p, (campaign.play as "A1" | "A2" | "A3" | null) ?? null, (contact?.persona as string | null) ?? null, String(account?.name ?? "the company")) : undefined,
      validation: { small_group: p.writing.validation.smallGroup },
      approved_proof_points: p.proofPoints,
      writing_rules: writing ?? undefined,
    },
  });
  await db.from("claude_calls").insert({ call_type: "rewrite", account_id: campaign.account_id, campaign_id: campaign.id, model: res.model, status: res.ok ? "ok" : "failed", attempts: res.attempts, input_tokens: res.usage?.input ?? null, output_tokens: res.usage?.output ?? null, cost_usd: res.usage?.costUsd ?? null, error: res.ok ? null : res.message, raw_output: res.rawText, requested_by: user.id });
  if (!res.ok) throw new ActionError(res.message, 502);

  const body = finishStep(step.channel, res.data.body, { firstName: first, assigneeId: assignee.id }, signers) ?? "";
  const subject = isEmail ? (res.data.subject ?? subjectNow ?? "").replace(/\s*—\s*/g, ", ").trim() : null;
  const issues = copyIssues(step.channel, subject, body, { emailWords: p.settings.email_word_flag, connectChars: p.settings.linkedin_connect_max_chars });
  const warnings = isEmail ? [...new Set([...emailChecks(subject, body), ...issues.filter((i) => !/em dash|words/.test(i))])] : issues;
  return { subject, body, changed: res.data.changed, warnings, cost: res.usage?.costUsd ?? null };
}
