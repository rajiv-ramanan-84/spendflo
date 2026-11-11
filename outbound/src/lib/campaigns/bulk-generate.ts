import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { ActionError, canEdit } from "./actions";
import { submitDraftBatch } from "./batch";
import { assertBudget, monthSpend } from "@/lib/claude/budget";
import { BULK_MAX_LIMIT, DEFAULT_BULK_MAX, draftCost } from "@/lib/claude/models";
import { playForAccount } from "@/lib/playbook/payload";
import { todayIn } from "@/lib/calendar/dates";

export type GenItem = { accountId: string; name: string; reason: string | null; level: string | null; model: string };
export type GenPlan = { willGenerate: GenItem[]; nurture: GenItem[]; replaceable: GenItem[]; skipped: GenItem[]; max: number; estimateUsd: number; remainingUsd: number };

export async function bulkLimit(db: SupabaseClient): Promise<number> {
  const { data } = await db.from("app_settings").select("caps").maybeSingle();
  const n = Number((data?.caps as Record<string, number> | null)?.bulk_generate_max);
  return Math.min(BULK_MAX_LIMIT, Math.max(1, Number.isFinite(n) && n > 0 ? n : DEFAULT_BULK_MAX));
}

/**
 * Sorts selected accounts into: will get a draft, Nurture accounts that would (only if the caller opts in),
 * and skipped with a reason. Never overwrites an existing draft. Pure reads, so it is safe as a preview.
 */
export async function planBulkGenerate(db: SupabaseClient, user: SessionUser, accountIds: string[]): Promise<GenPlan> {
  const ids = [...new Set(accountIds)];
  if (!ids.length) throw new ActionError("Select at least one account");
  const max = await bulkLimit(db);
  if (ids.length > max) throw new ActionError(`You can generate up to ${max} drafts at a time. Select ${max} or fewer, or an admin can raise the limit in Settings.`);

  const [{ data: accounts }, { data: camps }, { data: calls }, { data: people }, { data: settings }, spend] = await Promise.all([
    db.from("accounts").select("id, name, tier, owner_id, archived, do_not_contact, signals, vendor_signals, outreach_angle, icp_verdict").in("id", ids).is("deleted_at", null),
    db.from("campaigns").select("id, account_id, status").in("account_id", ids).is("deleted_at", null).in("status", ["draft", "active", "paused", "responded", "meeting_booked"]),
    db.from("claude_calls").select("account_id").eq("call_type", "generate_campaign").in("account_id", ids).in("status", ["queued", "running"]),
    db.from("contacts").select("account_id, email, linkedin_url").in("account_id", ids).is("deleted_at", null).is("sheet_deleted_at", null).eq("exclude", false).eq("do_not_contact", false),
    db.from("app_settings").select("default_model, tier_a_model").maybeSingle(),
    monthSpend(db),
  ]);
  // A draft someone has edited by hand is never replaced.
  const draftIds = (camps ?? []).filter((c) => c.status === "draft").map((c) => c.id as string);
  const { data: draftSteps } = draftIds.length ? await db.from("steps").select("campaign_id, body, original_body").in("campaign_id", draftIds).is("deleted_at", null) : { data: [] as Array<{ campaign_id: string; body: string | null; original_body: string | null }> };
  const editedCampaigns = new Set((draftSteps ?? []).filter((x) => (x.body ?? "") !== (x.original_body ?? "")).map((x) => x.campaign_id as string));
  const has = (set: Array<{ account_id: unknown }> | null, id: string) => (set ?? []).some((x) => x.account_id === id);
  const usable = new Set((people ?? []).filter((c) => c.email || c.linkedin_url).map((c) => c.account_id as string));
  const today = todayIn();
  const plan: GenPlan = { willGenerate: [], nurture: [], replaceable: [], skipped: [], max, estimateUsd: 0, remainingUsd: spend.remaining };

  for (const a of accounts ?? []) {
    const model = ((a.tier === "A" ? settings?.tier_a_model : settings?.default_model) as string | undefined) ?? "claude-sonnet-5-5";
    const item = (reason: string | null, level: string | null = null): GenItem => ({ accountId: a.id as string, name: a.name as string, reason, level, model });
    if (!canEdit(user, a.owner_id as string | null)) { plan.skipped.push(item("Not your account")); continue; }
    if (a.archived || a.do_not_contact) { plan.skipped.push(item(a.do_not_contact ? "Do not contact" : "Archived")); continue; }
    if (!a.owner_id) { plan.skipped.push(item("No owner yet")); continue; }
    const mine = (camps ?? []).filter((c) => c.account_id === a.id);
    if (mine.some((c) => c.status !== "draft")) { plan.skipped.push(item("Already has a live campaign")); continue; }
    const draft = mine.find((c) => c.status === "draft");
    if (draft && editedCampaigns.has(draft.id as string)) { plan.skipped.push(item("Its draft has your edits, so it is not replaced")); continue; }
    if (has(calls, a.id as string)) { plan.skipped.push(item("A draft is already being written")); continue; }
    if (!usable.has(a.id as string)) { plan.skipped.push(item("No contact with an email or LinkedIn yet")); continue; }
    const gate = playForAccount(a as unknown as { signals: string | null; outreach_angle: string | null; archived: boolean | null; icp_verdict: string | null; do_not_contact: boolean | null }, today);
    if (gate.level === "not_fit") { plan.skipped.push(item("Not a fit")); continue; }
    if (gate.level === "nurture") {
      // Nothing on the account points to a play, so a person has to choose one on the account page first.
      if (!gate.pointsTo) { plan.skipped.push(item("No signal and no play to draft for. Open the account to choose one.", "nurture")); continue; }
      (draft ? plan.replaceable : plan.nurture).push(item(null, "nurture"));
      continue;
    }
    (draft ? plan.replaceable : plan.willGenerate).push(item(null, gate.level));
  }
  for (const id of ids) if (!(accounts ?? []).some((a) => a.id === id)) plan.skipped.push({ accountId: id, name: "Unknown account", reason: "Not found", level: null, model: "" });
  plan.estimateUsd = Math.round(plan.willGenerate.reduce((s, i) => s + draftCost(i.model), 0) * 100) / 100;
  return plan;
}

/** Queues every eligible draft and sends them to Claude as one batch. Nothing launches on its own. */
export async function bulkGenerate(db: SupabaseClient, user: SessionUser, accountIds: string[], opts: { includeNurture: boolean; replaceDrafts?: boolean }) {
  const plan = await planBulkGenerate(db, user, accountIds);
  const todo = [...plan.willGenerate, ...(opts.replaceDrafts ? plan.replaceable : []), ...(opts.includeNurture ? plan.nurture : [])];
  if (!todo.length) return { queued: 0, names: [] as string[], skipped: plan.skipped, estimateUsd: 0 };
  await assertBudget(db, "draft", todo.length);
  const { data: rows, error } = await db.from("claude_calls").insert(todo.map((t) => ({
    call_type: "generate_campaign", account_id: t.accountId, status: "queued", requested_by: user.id,
  }))).select("id");
  if (error || !rows) throw new ActionError(error?.message ?? "Could not queue the drafts", 500);
  try {
    await submitDraftBatch(db, { onlyIds: rows.map((r) => r.id as string) });
  } catch (e) {
    // Still queued: the 5-minute run picks them up.
    console.error("Bulk batch send failed:", e);
  }
  const est = todo.reduce((s, i) => s + draftCost(i.model), 0);
  return { queued: todo.length, names: todo.map((t) => t.name), skipped: plan.skipped, estimateUsd: Math.round(est * 100) / 100 };
}
