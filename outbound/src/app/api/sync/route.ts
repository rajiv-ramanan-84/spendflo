import { NextResponse, type NextRequest } from "next/server";
import { requireUser, canAssignAccounts } from "@/lib/auth/session";
import { runSheetSync } from "@/lib/sheet-sync/run";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** "Sync now" for admins and the manager. ?dry=1 reads and plans without writing anything. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!canAssignAccounts(user)) return NextResponse.json({ error: "Only admins and the manager can run a sync" }, { status: 403 });
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  try {
    return NextResponse.json(await runSheetSync({ dryRun, triggeredBy: user.id }));
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
