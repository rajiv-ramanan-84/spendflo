import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { pauseAllTracks } from "@/lib/campaigns/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { reason?: string; exceptContactId?: string | null };
  return withUser(({ user, db }) => pauseAllTracks(db, user, id, String(b.reason ?? ""), { exceptContactId: b.exceptContactId ?? null }));
}
