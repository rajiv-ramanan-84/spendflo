import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { markMeetingBooked } from "@/lib/campaigns/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { contactId?: string | null };
  return withUser(({ user, db }) => markMeetingBooked(db, user, id, b.contactId ?? null));
}
