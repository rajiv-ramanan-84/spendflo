import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { skillText } from "@/lib/claude/skill-settings";

/** Downloads the current skill (or ?version=N) as SKILL.md for editing. */
export async function GET(req: NextRequest) {
  await requireUser();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  const v = Number(new URL(req.url).searchParams.get("version")) || undefined;
  const skill = await skillText(db, v);
  if (!skill) return NextResponse.json({ error: "No skill saved yet" }, { status: 404 });
  return new NextResponse(skill.body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="flo-campaign-engine-SKILL-v${skill.versionNo}.md"`,
    },
  });
}
