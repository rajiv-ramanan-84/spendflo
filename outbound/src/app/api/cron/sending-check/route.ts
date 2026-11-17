import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { evaluateMailboxHealth, refreshDomains } from "@/lib/sending/health";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Daily: re-check every sending domain's SPF, DKIM and DMARC, and pause any inbox whose bounce rate is past the line. */
async function handle(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  const [domains, health] = await Promise.all([refreshDomains(db), evaluateMailboxHealth(db)]);
  return NextResponse.json({ ok: true, ...domains, paused: health.paused });
}
export const GET = handle;
export const POST = handle;
