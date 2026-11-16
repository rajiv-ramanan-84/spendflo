import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";

/** A chat with its messages and the actions that are waiting or were decided. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async ({ user, db }) => {
    const { data: t } = await db.from("agent_threads").select("id, title, context").eq("id", id).eq("user_id", user.id!).maybeSingle();
    if (!t) throw new ActionError("Chat not found", 404);
    const [{ data: messages }, { data: actions }] = await Promise.all([
      db.from("agent_messages").select("id, role, content, run_id, created_at").eq("thread_id", id).order("created_at").limit(200),
      db.from("agent_actions").select("id, title, status, est_credits, run_id, created_at").eq("thread_id", id).order("created_at").limit(50),
    ]);
    return { thread: t, messages: messages ?? [], actions: actions ?? [] };
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async ({ user, db }) => {
    await db.from("agent_threads").update({ archived: true }).eq("id", id).eq("user_id", user.id!);
  });
}
