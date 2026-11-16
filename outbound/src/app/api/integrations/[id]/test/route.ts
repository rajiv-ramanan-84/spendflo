import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { testIntegration } from "@/lib/agent/integrations";

export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async ({ user, db }) => ({ result: await testIntegration(db, user, id) }));
}
