import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { finishMailboxConsent, readState } from "@/lib/google/mailbox-oauth";
import { encryptToken, parseKey } from "@/lib/crypto/tokens";
import { logActivity } from "@/lib/activity/log";

const back = (req: NextRequest, q: string) => NextResponse.redirect(new URL(`/settings?${q}#mailboxes`, req.url));

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const db = supabaseAdmin();
  const state = readState(req.nextUrl.searchParams.get("state"));
  const code = req.nextUrl.searchParams.get("code");
  if (!db || !state || !code || state.userId !== user.id) return back(req, "mailbox_error=expired");

  const { data: m } = await db.from("mailboxes").select("id, email").eq("id", state.mailboxId).maybeSingle();
  if (!m) return back(req, "mailbox_error=not_found");
  let result;
  try {
    result = await finishMailboxConsent(code);
  } catch {
    return back(req, "mailbox_error=google");
  }
  // Google must have signed in the exact mailbox we asked for.
  if (result.email !== String(m.email).toLowerCase()) return back(req, `mailbox_error=wrong_account&got=${encodeURIComponent(result.email ?? "")}`);
  if (!result.refreshToken) return back(req, "mailbox_error=no_refresh");

  await db.from("mailboxes").update({
    google_refresh_token_enc: encryptToken(result.refreshToken, parseKey(process.env.TOKEN_ENCRYPTION_KEY)),
    google_token_status: "ok", connected_by: user.id, connected_at: new Date().toISOString(),
  }).eq("id", m.id);
  await logActivity(db, { entityType: "mailbox", entityId: m.id, action: "connected", actorId: user.id });
  return back(req, "mailbox_connected=1");
}
