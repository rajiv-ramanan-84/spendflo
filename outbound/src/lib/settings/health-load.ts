import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { canSee } from "./nav";
import { buildTiles, type HealthInputs } from "./health";
import { slackConfigured } from "@/lib/slack/client";
import { loadAgentConfig, monthTotals } from "@/lib/agent/store";
import { monthSpend } from "@/lib/claude/budget";
import { listIntegrations } from "@/lib/agent/integrations";

const minutesSince = (iso: string | null | undefined) => (iso ? Math.max(0, (Date.now() - Date.parse(iso)) / 60_000) : null);

/** The facts behind the Overview tiles. People below manager only get their own tiles, so those queries are skipped. */
export async function loadHealth(db: SupabaseClient, user: SessionUser) {
  const manager = canSee(user.role, "manager");
  const [{ data: me }, { data: sig }] = await Promise.all([
    db.from("users").select("google_token_status, slack_user_id, send_mailbox_id").eq("id", user.id!).single(),
    db.from("writing_rules").select("signature").eq("scope", "sender").eq("key", user.id!).order("version_no", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: mb } = me?.send_mailbox_id ? await db.from("mailboxes").select("id, email, google_token_status").eq("id", me.send_mailbox_id).maybeSingle() : { data: null };

  const inputs: HealthInputs = {
    me: { gmail: (me?.google_token_status as "ok" | "expired" | "missing" | undefined) ?? "missing", slackSet: !!me?.slack_user_id, signatureSet: !!(sig?.signature as string | null)?.trim(), mailbox: { shared: !!mb, id: (mb?.id as string | undefined) ?? null, email: (mb?.email as string | undefined) ?? null, status: (mb?.google_token_status as string | undefined) ?? null } },
    sync: { status: "never", agoMin: null, rows: 0 }, slack: { connected: false, channel: false }, feed: { configured: false, error: null },
    linkedin: { lastAgoHours: null, unmatched: 0 }, assistant: { enabled: true, usd: 0, usdCap: 50, credits: 0, creditCap: 500, warnPct: 80 },
    drafting: { spent: 0, budget: 50 }, integrations: { enabled: 0, failing: 0, toReview: 0 }, team: { expiredGmail: 0 },
  };

  if (manager) {
    const [run, issues, app, feedRun, li, liUn, cfg, totals, spend, ints, team] = await Promise.all([
      db.from("sync_runs").select("status, finished_at, started_at").eq("dry_run", false).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("data_quality_issues").select("id", { count: "exact", head: true }).eq("status", "open"),
      db.from("app_settings").select("slack_channel_id").maybeSingle(),
      db.from("signal_feed_runs").select("started_at, error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("linkedin_events").select("received_at").order("received_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("linkedin_events").select("id", { count: "exact", head: true }).in("status", ["unmatched", "ambiguous"]).gte("received_at", new Date(Date.now() - 14 * 86400000).toISOString()),
      loadAgentConfig(db), monthTotals(db), monthSpend(db), listIntegrations(db),
      db.from("users").select("id", { count: "exact", head: true }).eq("active", true).neq("google_token_status", "ok"),
    ]);
    const r = run.data;
    inputs.sync = { status: !r ? "never" : r.status === "failed" ? "failed" : "ok", agoMin: minutesSince((r?.finished_at ?? r?.started_at) as string | undefined), rows: issues.count ?? 0 };
    inputs.slack = { connected: slackConfigured(), channel: !!(app.data?.slack_channel_id || process.env.SLACK_CHANNEL_ID) };
    inputs.feed = { configured: !!process.env.GOOGLE_SIGNALS_SHEET_ID, error: (feedRun.data?.error as string | null) ?? null };
    const lm = minutesSince(li.data?.received_at as string | undefined);
    inputs.linkedin = { lastAgoHours: lm === null ? null : lm / 60, unmatched: liUn.count ?? 0 };
    inputs.assistant = { enabled: cfg.enabled, usd: totals.usd, usdCap: cfg.claudeMonthlyUsd, credits: totals.credits, creditCap: cfg.tapistroMonthlyCredits, warnPct: cfg.warnPct };
    inputs.drafting = { spent: spend.spent + spend.pending, budget: spend.budget };
    inputs.integrations = { enabled: ints.integrations.filter((i) => i.enabled).length, failing: ints.integrations.filter((i) => i.status === "error").length, toReview: ints.tools.filter((t) => t.needs_review && ints.integrations.find((i) => i.id === t.integration_id)?.enabled).length };
    inputs.team = { expiredGmail: team.count ?? 0 };
  }
  return buildTiles(inputs).filter((t) => canSee(user.role, t.min));
}
