import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { markDone } from "@/lib/steps/execute";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { note?: string; callOutcome?: "connected" | "voicemail" | "no_answer" };
  return withUser(({ user, db }) => markDone(db, user, id, { note: b.note ?? null, callOutcome: b.callOutcome ?? null }));
}
