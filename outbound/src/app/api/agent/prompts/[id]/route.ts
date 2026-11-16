import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async ({ user, db }) => { await db.from("agent_saved_prompts").delete().eq("id", id).eq("user_id", user.id!); });
}
