import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { requestReplan } from "@/lib/responses/service";

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { responseId?: string; ownerNextStep?: string; scope?: "track" | "campaign" };
  return withUser(({ user, db }) => requestReplan(db, user, { campaignId: id, responseId: b.responseId ?? null, ownerNextStep: b.ownerNextStep?.slice(0, 2000) ?? null, scope: b.scope === "track" ? "track" : "campaign" }));
}
