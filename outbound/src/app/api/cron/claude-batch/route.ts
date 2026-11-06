import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { collectDraftBatches, submitDraftBatch } from "@/lib/campaigns/batch";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Every 5 minutes: send any queued drafts as one batch, then save finished
 * ones as Drafts. ?step=submit or ?step=collect runs just one half.
 */
async function handle(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  const step = new URL(req.url).searchParams.get("step");
  const submitted = step === "collect" ? null : await submitDraftBatch(db);
  const collected = step === "submit" ? null : await collectDraftBatches(db);
  return NextResponse.json({ submitted, collected });
}
export const GET = handle;
export const POST = handle;
