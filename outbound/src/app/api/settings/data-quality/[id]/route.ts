import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { canAssignAccounts } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";

/** Ignore a row to check: it stops counting and the sync will not raise it again. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async ({ user, db }) => {
    if (!canAssignAccounts(user)) throw new ActionError("Only admins and the manager can ignore rows", 403);
    const { error } = await db.from("data_quality_issues").update({ status: "ignored", resolved_at: new Date().toISOString() }).eq("id", id).eq("status", "open");
    if (error) throw new ActionError(error.message, 500);
    await logActivity(db, { entityType: "data_quality_issue", entityId: id, action: "ignored", actorId: user.id });
    return {};
  });
}
