import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings, type SessionUser } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";

const Model = z.enum(["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"]);
export const SpendInput = z.object({
  autoDraft: z.enum(["off", "a", "ab"]), budget: z.number().min(0).max(5000),
  defaultModel: Model.optional(), tierAModel: Model.optional(), bulkMax: z.number().int().min(1).max(25).optional(),
});

/** Drafting settings. One function for the Settings page and the assistant, so they cannot drift apart. */
export async function saveSpendSettings(db: SupabaseClient, user: SessionUser, input: z.infer<typeof SpendInput>) {
  if (!canEditAdminSettings(user)) throw new ActionError("Only admins can change Claude spend settings", 403);
  const { data: cur } = await db.from("app_settings").select("caps").eq("id", true).maybeSingle();
  const caps = input.bulkMax ? { ...((cur?.caps as Record<string, unknown> | null) ?? {}), bulk_generate_max: input.bulkMax } : undefined;
  const { error } = await db.from("app_settings").update({
    auto_draft: input.autoDraft, claude_monthly_budget_usd: input.budget, updated_by: user.id,
    ...(input.defaultModel ? { default_model: input.defaultModel } : {}),
    ...(input.tierAModel ? { tier_a_model: input.tierAModel } : {}),
    ...(caps ? { caps } : {}),
  }).eq("id", true);
  if (error) throw new ActionError(error.message, 500);
  // Turning auto-drafting down also drops sync-queued drafts nobody asked for yet.
  let dropped = 0;
  const keepTiers = input.autoDraft === "ab" ? ["A", "B"] : input.autoDraft === "a" ? ["A"] : [];
  const { data: waiting } = await db.from("claude_calls").select("id, account_id").eq("call_type", "generate_campaign").eq("status", "queued").is("batch_id", null).is("requested_by", null);
  if (waiting?.length) {
    const { data: accts } = await db.from("accounts").select("id, tier").in("id", waiting.map((w) => w.account_id));
    const tier = new Map((accts ?? []).map((a) => [a.id, a.tier as string | null]));
    const drop = waiting.filter((w) => !keepTiers.includes(tier.get(w.account_id) ?? "")).map((w) => w.id);
    if (drop.length) {
      await db.from("claude_calls").update({ status: "failed", error: "Auto-drafting turned off for this tier. Click Generate to draft it." }).in("id", drop);
      dropped = drop.length;
    }
  }
  await logActivity(db, { entityType: "settings", entityId: user.id!, action: "claude_spend_updated", actorId: user.id, after: { ...input, dropped } });
  return { dropped };
}

export async function loadSpendSettings(db: SupabaseClient) {
  const { data } = await db.from("app_settings").select("auto_draft, claude_monthly_budget_usd, default_model, tier_a_model, caps").eq("id", true).maybeSingle();
  return {
    autoDraft: ((data?.auto_draft as "off" | "a" | "ab" | undefined) ?? "off") as "off" | "a" | "ab",
    budget: Number(data?.claude_monthly_budget_usd ?? 50),
    defaultModel: (data?.default_model as string | undefined) ?? "claude-sonnet-5-5",
    tierAModel: (data?.tier_a_model as string | undefined) ?? "claude-opus-5-5",
    bulkMax: Number((data?.caps as Record<string, number> | null)?.bulk_generate_max) || undefined,
  };
}
