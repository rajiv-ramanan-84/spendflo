import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { snoozeStep } from "@/lib/steps/execute";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { days?: number };
  const days = (Number(b.days) || 1) as 1 | 2 | 3;
  return withUser(({ user, db }) => snoozeStep(db, user, id, days));
}
