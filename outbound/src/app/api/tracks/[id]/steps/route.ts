import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { addStep } from "@/lib/campaigns/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { channel: string; date: string; subject?: string; body?: string };
  return withUser(async ({ user, db }) => ({ stepId: await addStep(db, user, id, body) }));
}
