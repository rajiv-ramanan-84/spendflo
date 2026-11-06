import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { launchCampaign } from "@/lib/campaigns/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { acknowledgeFlags?: boolean };
  return withUser(({ user, db }) => launchCampaign(db, user, id, { acknowledgeFlags: !!b.acknowledgeFlags }));
}
