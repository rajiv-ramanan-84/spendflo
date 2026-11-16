import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { canAssignAccounts } from "@/lib/auth/session";

/** The full trace of one run. The person who ran it, managers and admins can read it. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async ({ user, db }) => {
    const { data: run } = await db.from("agent_runs").select("*").eq("id", id).maybeSingle();
    if (!run) throw new ActionError("Run not found", 404);
    if (run.user_id !== user.id && !canAssignAccounts(user)) throw new ActionError("Not your run", 403);
    const { data: steps } = await db.from("agent_steps").select("*").eq("run_id", id).order("seq");
    return { run, steps: steps ?? [] };
  });
}
