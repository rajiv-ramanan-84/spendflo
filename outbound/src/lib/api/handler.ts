import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ActionError } from "@/lib/campaigns/actions";

/** Wraps a route: signed-in team member, service DB client, friendly errors. */
export async function withUser<T>(fn: (ctx: { user: SessionUser; db: SupabaseClient }) => Promise<T>) {
  const user = await requireUser();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Database is not configured" }, { status: 500 });
  if (!user.id) return NextResponse.json({ ok: false, error: "Your account is not linked to the team list yet" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...((await fn({ user, db })) ?? {}) });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
