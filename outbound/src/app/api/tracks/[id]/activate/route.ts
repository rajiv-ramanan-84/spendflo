import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { activateTrack } from "@/lib/campaigns/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { reason?: string; startDate?: string };
  return withUser(({ user, db }) => activateTrack(db, user, id, String(b.reason ?? ""), b.startDate));
}
