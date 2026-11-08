import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { addPersonToCampaign } from "@/lib/campaigns/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { contactId?: string; reason?: string };
  return withUser(({ user, db }) => addPersonToCampaign(db, user, id, String(b.contactId ?? ""), String(b.reason ?? "")));
}
