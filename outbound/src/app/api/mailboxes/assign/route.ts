import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings } from "@/lib/auth/session";

/** Who sends from which mailbox. mailboxId null = their own Gmail. */
export async function PATCH(req: NextRequest) {
  const parsed = z.object({ userId: z.string().uuid(), mailboxId: z.string().uuid().nullable() }).safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!canEditAdminSettings(user)) throw new ActionError("Only admins can change who sends from where", 403);
    if (!parsed.success) throw new ActionError("Pick a person and a mailbox");
    await db.from("users").update({ send_mailbox_id: parsed.data.mailboxId }).eq("id", parsed.data.userId);
    return {};
  });
}
