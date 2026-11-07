import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";

/** Removes a shared mailbox. Anyone sending from it goes back to their own Gmail. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async ({ user, db }) => {
    if (!canEditAdminSettings(user)) throw new ActionError("Only admins can remove mailboxes", 403);
    await db.from("users").update({ send_mailbox_id: null }).eq("send_mailbox_id", id);
    await db.from("mailboxes").delete().eq("id", id);
    await logActivity(db, { entityType: "mailbox", entityId: id, action: "removed", actorId: user.id });
    return {};
  });
}
