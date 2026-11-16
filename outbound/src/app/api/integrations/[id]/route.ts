import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { deleteIntegration, updateIntegration } from "@/lib/agent/integrations";

const Body = z.object({ enabled: z.boolean().optional(), url: z.string().trim().url().optional(), token: z.string().trim().max(4000).nullable().optional(), name: z.string().trim().min(2).max(60).optional() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError("Check the values");
    await updateIntegration(db, user, id, parsed.data);
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async ({ user, db }) => deleteIntegration(db, user, id));
}
