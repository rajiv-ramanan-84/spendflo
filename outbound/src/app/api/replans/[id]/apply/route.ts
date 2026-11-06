import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { applyReplan } from "@/lib/responses/service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { contactIds?: string[] };
  return withUser(({ user, db }) => applyReplan(db, user, id, Array.isArray(b.contactIds) ? b.contactIds : undefined));
}
