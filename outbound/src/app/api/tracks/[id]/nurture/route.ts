import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { moveToNurture } from "@/lib/campaigns/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { reason?: string };
  return withUser(({ user, db }) => moveToNurture(db, user, id, String(b.reason ?? "")));
}
