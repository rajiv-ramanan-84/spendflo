import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { confirmResponse } from "@/lib/responses/service";
import { ClassifySchema } from "@/lib/claude/schemas";

const Kinds = ClassifySchema.shape.classification;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { classification?: string; pauseOtherTracks?: boolean };
  const parsed = b.classification ? Kinds.safeParse(b.classification) : null;
  return withUser(({ user, db }) => confirmResponse(db, user, id, { classification: parsed?.success ? parsed.data : undefined, pauseOtherTracks: !!b.pauseOtherTracks }));
}
