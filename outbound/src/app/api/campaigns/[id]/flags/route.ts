import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { clearAllFlags, clearFlag } from "@/lib/campaigns/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { flagId?: string; all?: boolean; how?: "resolved" | "dismissed" };
  return withUser(({ user, db }) => (body.all ? clearAllFlags(db, user, id) : clearFlag(db, user, id, String(body.flagId ?? ""), body.how === "dismissed" ? "dismissed" : "resolved")));
}
