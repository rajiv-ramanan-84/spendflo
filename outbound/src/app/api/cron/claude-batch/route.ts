import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { collectDraftBatches, submitDraftBatch } from "@/lib/campaigns/batch";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * ?step=submit sends queued drafts as one batch (scheduled after midnight IST).
 * ?step=collect saves finished results as Drafts (scheduled every 30 minutes).
 */
async function handle(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  const step = new URL(req.url).searchParams.get("step");
  if (step === "submit") return NextResponse.json(await submitDraftBatch(db));
  return NextResponse.json(await collectDraftBatches(db));
}
export const GET = handle;
export const POST = handle;
