import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";

const Model = z.enum(["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"]);
const Body = z.object({
  autoDraft: z.enum(["off", "a", "ab"]), budget: z.number().min(0).max(5000),
  defaultModel: Model.optional(), tierAModel: Model.optional(), bulkMax: z.number().int().min(1).max(25).optional(),
});

export async function PATCH(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!canEditAdminSettings(user)) throw new ActionError("Only admins can change Claude spend settings", 403);
    if (!parsed.success) throw new ActionError("Budget must be a number between 0 and 5000");
    const { data: cur } = await db.from("app_settings").select("caps").eq("id", true).maybeSingle();
    const caps = parsed.data.bulkMax ? { ...((cur?.caps as Record<string, unknown> | null) ?? {}), bulk_generate_max: parsed.data.bulkMax } : undefined;
    const { error } = await db.from("app_settings").update({
      auto_draft: parsed.data.autoDraft, claude_monthly_budget_usd: parsed.data.budget, updated_by: user.id,
      ...(parsed.data.defaultModel ? { default_model: parsed.data.defaultModel } : {}),
      ...(parsed.data.tierAModel ? { tier_a_model: parsed.data.tierAModel } : {}),
      ...(caps ? { caps } : {}),
    }).eq("id", true);
    if (error) throw new ActionError(error.message, 500);
    // Turning auto-drafting down also drops sync-queued drafts nobody asked for yet.
    let dropped = 0;
    const keepTiers = parsed.data.autoDraft === "ab" ? ["A", "B"] : parsed.data.autoDraft === "a" ? ["A"] : [];
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
    await logActivity(db, { entityType: "settings", entityId: user.id!, action: "claude_spend_updated", actorId: user.id, after: { ...parsed.data, dropped } });
    return { dropped };
  });
}
