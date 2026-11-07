import { NextResponse, type NextRequest } from "next/server";
import { canEditAdminSettings, requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mailboxConsentUrl } from "@/lib/google/mailbox-oauth";

/** Starts Google consent for a shared mailbox. Admins, or the person who uses it. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  const db = supabaseAdmin();
  const id = req.nextUrl.searchParams.get("mailbox");
  if (!db || !id || !user.id) return NextResponse.redirect(new URL("/settings?mailbox_error=missing#mailboxes", req.url));
  const { data: m } = await db.from("mailboxes").select("id, email").eq("id", id).maybeSingle();
  if (!m) return NextResponse.redirect(new URL("/settings?mailbox_error=not_found#mailboxes", req.url));
  const { data: me } = await db.from("users").select("send_mailbox_id").eq("id", user.id).single();
  if (!canEditAdminSettings(user) && me?.send_mailbox_id !== m.id) return NextResponse.redirect(new URL("/settings?mailbox_error=forbidden#mailboxes", req.url));
  return NextResponse.redirect(mailboxConsentUrl({ mailboxId: m.id, userId: user.id, email: m.email }));
}
