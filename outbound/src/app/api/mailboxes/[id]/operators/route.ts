import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";

const Body = z.object({ userId: z.string().uuid() });

/** Add or remove someone who runs a shared mailbox (they can edit its voice and signature). Admins only. */
async function change(req: NextRequest, ctx: { params: Promise<{ id: string }> }, add: boolean) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!canEditAdminSettings(user)) throw new ActionError("Only admins can choose who runs a mailbox", 403);
    if (!parsed.success) throw new ActionError("Pick a person");
    if (add) await db.from("mailbox_operators").upsert({ mailbox_id: id, user_id: parsed.data.userId }, { onConflict: "mailbox_id,user_id" });
    else await db.from("mailbox_operators").delete().eq("mailbox_id", id).eq("user_id", parsed.data.userId);
    await logActivity(db, { entityType: "mailbox", entityId: id, action: add ? "operator_added" : "operator_removed", actorId: user.id, after: { userId: parsed.data.userId } });
  });
}
export const POST = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => change(req, ctx, true);
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => change(req, ctx, false);
