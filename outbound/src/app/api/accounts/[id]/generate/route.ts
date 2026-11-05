import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateCampaign } from "@/lib/campaigns/generate";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Generate campaign button. The owner, admins and the manager can run it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Database is not configured" }, { status: 500 });
  const { id } = await params;

  const { data: account } = await db.from("accounts").select("owner_id").eq("id", id).maybeSingle();
  if (!account) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
  const allowed = user.role !== "member" || account.owner_id === user.id;
  if (!allowed) return NextResponse.json({ ok: false, error: "Only the owner, admins or the manager can generate this campaign" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { ownerNotes?: string };
  try {
    const res = await generateCampaign(db, { accountId: id, requestedBy: user.id, ownerNotes: body.ownerNotes?.slice(0, 2000) ?? null });
    return NextResponse.json(res, { status: res.ok ? 200 : 422 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, retryable: true }, { status: 500 });
  }
}
