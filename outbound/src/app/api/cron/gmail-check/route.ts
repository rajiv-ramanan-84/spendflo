import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runGmailCheck } from "@/lib/responses/detect";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  return NextResponse.json(await runGmailCheck(db));
}
export const GET = handle;
export const POST = handle;
