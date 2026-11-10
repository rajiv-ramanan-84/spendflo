import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { proposeEdit } from "@/lib/writing/ai-edit";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { instruction?: string };
  return withUser(({ user, db }) => proposeEdit(db, user, id, String(b.instruction ?? "")));
}
