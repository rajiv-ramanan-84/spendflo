import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queueDraft } from "@/lib/campaigns/batch";
import { playForAccount } from "@/lib/playbook/payload";
import { todayIn } from "@/lib/calendar/dates";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Generate campaign button. Queues the draft and sends it to Claude straight
 * away; it lands as a Draft in about 5 to 10 minutes. The owner, admins and
 * the manager can run it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Database is not configured" }, { status: 500 });
  const { id } = await params;

  const { data: account } = await db.from("accounts").select("owner_id, archived, signals, vendor_signals, outreach_angle, icp_verdict, do_not_contact").eq("id", id).maybeSingle();
  if (!account) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
  const allowed = user.role !== "member" || account.owner_id === user.id;
  if (!allowed) return NextResponse.json({ ok: false, error: "Only the owner, admins or the manager can generate this campaign" }, { status: 403 });
  if (account.archived) return NextResponse.json({ ok: false, error: "This account is archived." }, { status: 422 });

  const body = (await req.json().catch(() => ({}))) as { ownerNotes?: string; force?: boolean; play?: string };
  const chosen = body.play === "A1" || body.play === "A2" || body.play === "A3" ? body.play : null;
  // The gate: no signal in 90 days means nurture. A person can still draft one on purpose.
  const gate = playForAccount(account, todayIn());
  if (gate.level === "nurture" && !body.force) {
    return NextResponse.json({ ok: false, needsConfirm: true, error: "No signal in the last 90 days, so this account is in Nurture. Draft anyway to write a low-key sequence." }, { status: 409 });
  }
  // Nothing points to a play (no signal, no fit fact, no owner note): a person chooses, so Claude never gets all three.
  if (gate.level === "nurture" && !gate.pointsTo && !chosen) {
    return NextResponse.json({ ok: false, needsPlay: true, error: "Nothing on this account points to a play yet. Choose which one to draft for." }, { status: 409 });
  }
  try {
    const res = await queueDraft(db, { accountId: id, requestedBy: user.id, ownerNotes: body.ownerNotes?.slice(0, 2000) ?? null, play: gate.pointsTo ? null : chosen });
    return NextResponse.json({ ok: true, queued: true, ...res });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, retryable: true }, { status: 500 });
  }
}
