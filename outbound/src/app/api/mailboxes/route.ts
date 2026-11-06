import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";

const Body = z.object({ email: z.string().trim().toLowerCase().email(), writesAsUserId: z.string().uuid(), usedByUserId: z.string().uuid() });

/** Adds a shared mailbox and points one person's sending at it. Admins only. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!canEditAdminSettings(user)) throw new ActionError("Only admins can add mailboxes", 403);
    if (!parsed.success) throw new ActionError("Enter the mailbox address, whose name it writes as, and who uses it");
    const d = parsed.data;
    const { data: person } = await db.from("users").select("id").eq("email", d.email).maybeSingle();
    if (person) throw new ActionError("That address belongs to a teammate's own login. A shared mailbox needs its own address.");
    const { data: m, error } = await db.from("mailboxes").upsert({ email: d.email, writes_as_user_id: d.writesAsUserId }, { onConflict: "email" }).select("id").single();
    if (error || !m) throw new ActionError(error?.message ?? "Could not add the mailbox", 500);
    await db.from("users").update({ send_mailbox_id: m.id }).eq("id", d.usedByUserId);
    await logActivity(db, { entityType: "mailbox", entityId: m.id, action: "added", actorId: user.id, after: d });
    return { mailboxId: m.id };
  });
}
