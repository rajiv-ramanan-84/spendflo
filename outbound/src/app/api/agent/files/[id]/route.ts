import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { deleteFile } from "@/lib/agent/files";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async ({ user, db }) => deleteFile(db, user, id));
}
