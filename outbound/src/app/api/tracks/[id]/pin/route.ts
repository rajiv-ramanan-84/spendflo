import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { pinTrack } from "@/lib/campaigns/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { startDate?: string };
  return withUser(({ user, db }) => pinTrack(db, user, id, String(b.startDate ?? "")));
}
