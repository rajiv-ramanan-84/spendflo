import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { logActivity } from "@/lib/activity/log";

const Body = z.object({ slackUserId: z.string().trim().regex(/^([UW][A-Z0-9]{6,20})?$/, "A Slack member ID looks like U0123ABCD") });

/** Your own Slack member ID, so alerts @mention you. */
export async function PATCH(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Check the ID");
    const { error } = await db.from("users").update({ slack_user_id: parsed.data.slackUserId || null }).eq("id", user.id!);
    if (error) throw new ActionError(error.message, 500);
    await logActivity(db, { entityType: "settings", entityId: user.id!, action: "slack_id_updated", actorId: user.id, after: { set: !!parsed.data.slackUserId } });
  });
}
