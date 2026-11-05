import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { createGmailDraftForStep } from "@/lib/steps/execute";

export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(({ user, db }) => createGmailDraftForStep(db, user, id));
}
