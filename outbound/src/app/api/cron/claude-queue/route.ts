import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateCampaign } from "@/lib/campaigns/generate";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Drains queued draft generations (auto-drafts for new Tier A and B accounts,
 * bulk generate). A few per run so each finishes inside the function limit;
 * the schedule calls it every few minutes until the queue is empty.
 */
const PER_RUN = 3;

async function handle(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Database is not configured" }, { status: 500 });

  const { data: queued } = await db
    .from("claude_calls")
    .select("id, account_id, requested_by")
    .eq("status", "queued")
    .eq("call_type", "generate_campaign")
    .order("created_at", { ascending: true })
    .limit(PER_RUN);

  const results = [];
  for (const q of queued ?? []) {
    // Claim the row so an overlapping run does not take it too.
    const { data: claimed } = await db.from("claude_calls").update({ status: "running" }).eq("id", q.id).eq("status", "queued").select("id");
    if (!claimed?.length) continue;
    try {
      results.push(await generateCampaign(db, { accountId: q.account_id, requestedBy: q.requested_by, callId: q.id }));
    } catch (e) {
      await db.from("claude_calls").update({ status: "failed", error: (e as Error).message }).eq("id", q.id);
      results.push({ ok: false, error: (e as Error).message });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}

export const GET = handle;
export const POST = handle;
