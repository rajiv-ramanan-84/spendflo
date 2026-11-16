import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { setToolLevel } from "@/lib/agent/integrations";

const Body = z.object({ level: z.enum(["read", "approve", "blocked"]), credits: z.number().min(0).max(10000).optional() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ toolId: string }> }) {
  const { toolId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError("Pick read, approve or blocked");
    await setToolLevel(db, user, toolId, parsed.data);
  });
}
