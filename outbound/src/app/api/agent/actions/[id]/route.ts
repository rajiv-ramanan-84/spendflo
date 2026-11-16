import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { decideAction } from "@/lib/agent/actions";

const Body = z.object({ approve: z.boolean() });

/** Approve or reject something the assistant proposed. Only a person can do this. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError("Say whether to approve or reject");
    return decideAction(db, user, id, parsed.data.approve);
  });
}
