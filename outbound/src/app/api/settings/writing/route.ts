import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { saveWritingRule } from "@/lib/writing/rules";

export async function PUT(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { scope?: string; key?: string; instructions?: string; signature?: string | null };
  return withUser(({ user, db }) => saveWritingRule(db, user, { scope: String(b.scope ?? ""), key: String(b.key ?? ""), instructions: String(b.instructions ?? ""), signature: b.signature ?? null }));
}
