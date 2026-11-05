import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { skipStep } from "@/lib/steps/execute";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { reason?: string };
  return withUser(async ({ user, db }) => { await skipStep(db, user, id, String(b.reason ?? "")); return {}; });
}
