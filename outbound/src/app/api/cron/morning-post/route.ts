import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runMorningPost } from "@/lib/slack/posts";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  return NextResponse.json(await runMorningPost(db, { force }));
}
export const GET = handle;
export const POST = handle;
