import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { finishMailboxConsent, readState } from "@/lib/google/mailbox-oauth";
import { encryptToken, parseKey } from "@/lib/crypto/tokens";
import { logActivity } from "@/lib/activity/log";

/** Admins and managers land on Mailboxes; everyone else on My setup, which is where they connect their own. */
const back = (req: NextRequest, q: string, role?: string) => NextResponse.redirect(new URL(`${role === "admin" || role === "manager" ? "/settings/team/mailboxes" : "/settings/me"}?${q}`, req.url));

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const db = supabaseAdmin();
  const state = readState(req.nextUrl.searchParams.get("state"));
  const code = req.nextUrl.searchParams.get("code");
  if (!db || !state || !code || state.userId !== user.id) return back(req, "mailbox_error=expired", user.role);

  const { data: m } = await db.from("mailboxes").select("id, email").eq("id", state.mailboxId).maybeSingle();
  if (!m) return back(req, "mailbox_error=not_found", user.role);
  let result;
  try {
    result = await finishMailboxConsent(code);
  } catch {
    return back(req, "mailbox_error=google", user.role);
  }
  // Google must have signed in the exact mailbox we asked for.
  if (result.email !== String(m.email).toLowerCase()) return back(req, `mailbox_error=wrong_account&got=${encodeURIComponent(result.email ?? "")}`, user.role);
  if (!result.refreshToken) return back(req, "mailbox_error=no_refresh", user.role);

  const { data: first } = await db.from("mailboxes").select("warmup_started_at").eq("id", m.id).single();
  await db.from("mailboxes").update({
    ...(first?.warmup_started_at ? {} : { warmup_started_at: new Date().toISOString() }),
    google_refresh_token_enc: encryptToken(result.refreshToken, parseKey(process.env.TOKEN_ENCRYPTION_KEY)),
    google_token_status: "ok", connected_by: user.id, connected_at: new Date().toISOString(),
  }).eq("id", m.id);
  await logActivity(db, { entityType: "mailbox", entityId: m.id, action: "connected", actorId: user.id });
  return back(req, "mailbox_connected=1", user.role);
}
