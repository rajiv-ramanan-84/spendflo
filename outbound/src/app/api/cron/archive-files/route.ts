import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { archiveOldFiles } from "@/lib/agent/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily: attached files older than 30 days leave the recent list. Their text stays in the database. */
async function handle(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  return NextResponse.json({ ok: true, ...(await archiveOldFiles(db)) });
}
export const GET = handle;
export const POST = handle;
