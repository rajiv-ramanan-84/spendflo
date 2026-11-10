import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { ActionError, canEdit } from "@/lib/campaigns/actions";

/** The owner has seen the new signals (re-planned, regenerated or decided to leave the plan). Clears the prompt. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async ({ user, db }) => {
    const { data: a } = await db.from("accounts").select("owner_id").eq("id", id).maybeSingle();
    if (!a) throw new ActionError("Account not found", 404);
    if (!canEdit(user, a.owner_id as string | null)) throw new ActionError("Only the owner, admins or the manager can do this", 403);
    await db.from("accounts").update({ signals_reviewed_at: new Date().toISOString() }).eq("id", id);
    return {};
  });
}
