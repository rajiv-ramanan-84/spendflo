import { NextResponse } from "next/server";
import { canEditAdminSettings, requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/calendar/dates";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Full backup as one JSON file, for admins. The free database plan has no
 * automatic backups, and accounts and contacts can be re-synced from the
 * sheet, but campaigns, steps, replies and history live only here.
 * Google tokens are left out: people simply sign in again after a restore.
 */
const TABLES = [
  "users", "app_settings", "skill_versions", "proof_points", "holidays", "user_out_of_office",
  "accounts", "contacts", "do_not_contact", "account_pins", "saved_views",
  "campaigns", "campaign_versions", "contact_tracks", "steps", "responses", "replan_drafts",
  "claude_calls", "notifications", "slack_posts", "sync_runs", "data_quality_issues", "activity_log",
] as const;

export async function GET() {
  const user = await requireUser();
  if (!canEditAdminSettings(user)) return NextResponse.json({ error: "Only admins can download a backup" }, { status: 403 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Database is not configured" }, { status: 500 });

  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(t).select("*").range(from, from + 999);
      if (error) return NextResponse.json({ error: `Backup stopped at ${t}: ${error.message}` }, { status: 500 });
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    out[t] = t === "users" ? rows.map((r) => {
      const copy = { ...r };
      delete copy.google_refresh_token_enc;
      return copy;
    }) : rows;
  }
  const body = JSON.stringify({ app: "outbound-command-center", taken_at: new Date().toISOString(), tables: out });
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="outbound-backup-${todayIn()}.json"`,
    },
  });
}
