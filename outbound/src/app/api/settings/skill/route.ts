import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { saveSkill } from "@/lib/claude/skill-settings";

export async function PUT(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { text?: string };
  return withUser(({ user, db }) => saveSkill(db, user, String(b.text ?? "")));
}
