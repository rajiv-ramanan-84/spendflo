import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { logActivity } from "@/lib/activity/log";
import { usableMailboxIds } from "@/lib/sending/usage";

const Body = z.object({ paused: z.boolean(), reason: z.string().trim().max(200).optional() });

/** Pause or resume an inbox. Anyone who can send from it may pause it; resuming is for admins and managers. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError("Say whether to pause or resume");
    const lead = user.role === "admin" || user.role === "manager";
    if (!lead && !(parsed.data.paused && (await usableMailboxIds(db, user.id!)).includes(id))) throw new ActionError("Only admins and managers can resume an inbox", 403);
    const reason = parsed.data.paused ? parsed.data.reason || `Paused by ${user.name}` : null;
    await db.from("mailboxes").update({ paused_at: parsed.data.paused ? new Date().toISOString() : null, paused_reason: reason }).eq("id", id);
    await logActivity(db, { entityType: "mailbox", entityId: id, action: parsed.data.paused ? "paused" : "resumed", actorId: user.id, after: { reason } });
    return {};
  });
}
