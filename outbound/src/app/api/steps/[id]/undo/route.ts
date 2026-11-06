import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { undoStepAction } from "@/lib/steps/execute";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async ({ user, db }) => { await undoStepAction(db, user, id); return {}; });
}
