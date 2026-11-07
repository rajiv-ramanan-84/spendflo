import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayIn } from "@/lib/calendar/dates";
import { invalidReasons } from "@/lib/calendar/working-calendar";
import { isPastPostTime, teamDayOff } from "./schedule";
import { loadCalendarContext } from "@/lib/calendar/context";
import { loadToday } from "@/lib/data/today";
import { postMessage, slackConfigured } from "./client";
import { alertWorthy, morningParent, personThread, replyAlert, type Person } from "./messages";

/**
 * Posts to #outbound-command. Every post is claimed in slack_posts first, so
 * a cron retry or a second server never posts twice. A failed post releases
 * its claim so the next run can try again.
 */

type Settings = { slack_channel_id: string | null; slack_post_times: { morning?: string; timezone?: string }; slack_posts_enabled: Record<string, boolean> };

async function settings(db: SupabaseClient) {
  const { data } = await db.from("app_settings").select("slack_channel_id, slack_post_times, slack_posts_enabled").single();
  const s = data as Settings | null;
  return { channel: s?.slack_channel_id || process.env.SLACK_CHANNEL_ID || null, times: s?.slack_post_times ?? {}, enabled: s?.slack_posts_enabled ?? {} };
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Claims a post slot. Returns the existing row if it was already posted, or null if another run holds it. */
async function claim(db: SupabaseClient, key: { post_type: string; for_date: string; user_id?: string | null; dedupe_key?: string }) {
  const row = { post_type: key.post_type, for_date: key.for_date, user_id: key.user_id ?? null, dedupe_key: key.dedupe_key ?? "" };
  const { data, error } = await db.from("slack_posts").insert(row).select("id").single();
  if (!error) return { id: data.id as string, fresh: true, ts: null as string | null };
  if (error.code !== "23505") throw new Error(error.message);
  let q = db.from("slack_posts").select("id, channel_ts").eq("post_type", row.post_type).eq("for_date", row.for_date).eq("dedupe_key", row.dedupe_key);
  q = row.user_id ? q.eq("user_id", row.user_id) : q.is("user_id", null);
  const { data: existing } = await q.maybeSingle();
  return { id: existing?.id as string, fresh: false, ts: (existing?.channel_ts as string | null) ?? null };
}

async function send(db: SupabaseClient, claimId: string, channel: string, msg: { text: string; blocks: unknown[] }, threadTs?: string) {
  const r = await postMessage(channel, msg, threadTs);
  if (!r.ok) {
    await db.from("slack_posts").delete().eq("id", claimId);
    return { ok: false as const, error: r.error };
  }
  await db.from("slack_posts").update({ channel_ts: r.ts }).eq("id", claimId);
  return { ok: true as const, ts: r.ts };
}

/**
 * Morning plan: team totals, then one thread reply per person. Safe to call
 * every 15 minutes: it waits for the post time, skips weekends, team
 * holidays and quiet periods, and posts once per day.
 */
export async function runMorningPost(db: SupabaseClient, opts: { now?: Date; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const s = await settings(db);
  const tz = s.times.timezone ?? "Asia/Kolkata";
  const today = todayIn(tz, now);
  if (!s.enabled.morning) return { posted: false, reason: "Morning post is turned off in Settings" };
  if (!slackConfigured() || !s.channel) return { posted: false, reason: "Slack is not connected (bot token and channel)" };
  if (!opts.force && !isPastPostTime(now, s.times.morning ?? "08:30", tz)) return { posted: false, reason: `Waiting for ${s.times.morning ?? "08:30"}` };

  const year = Number(today.slice(0, 4));
  const ctx = await loadCalendarContext(db, [year - 1, year, year + 1]);
  const off = teamDayOff(today, ctx);
  if (off.length) return { posted: false, reason: `Not a working day (${off.join(", ")})` };

  const parentClaim = await claim(db, { post_type: "morning", for_date: today });
  if (!parentClaim.fresh && !parentClaim.ts) return { posted: false, reason: "Another run is posting" };

  const { data: users } = await db.from("users").select("id, name, slack_user_id, google_token_status").eq("active", true).order("name");
  let parentTs = parentClaim.ts;
  if (!parentTs) {
    const team = await loadToday(db, { userId: null, scope: "team", today, ctx });
    const yStart = `${addDays(today, -1)}T00:00:00`;
    const tStart = `${today}T00:00:00`;
    const [{ count: newDrafts }, { count: meetings }, { count: replies }] = await Promise.all([
      db.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "draft").gte("created_at", yStart).is("deleted_at", null),
      db.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "meeting_booked").gte("updated_at", yStart).lt("updated_at", tStart),
      db.from("responses").select("id", { count: "exact", head: true }).gte("received_at", yStart).lt("received_at", tStart).neq("state", "dismissed").not("classification", "in", "(auto_reply,bounce)"),
    ]);
    const label = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
    const r = await send(db, parentClaim.id, s.channel, morningParent(label, {
      dueToday: team.header.dueToday, repliesWaiting: team.header.replies, overdue: team.header.overdue,
      newDrafts: newDrafts ?? 0, meetingsYesterday: meetings ?? 0, repliesYesterday: replies ?? 0,
    }, appUrl()));
    if (!r.ok) return { posted: false, reason: `Slack refused the post: ${r.error}` };
    parentTs = r.ts;
  }

  const threads: string[] = [];
  for (const u of users ?? []) {
    if (invalidReasons(today, { assigneeId: u.id }, ctx).includes("assignee_out_of_office")) continue;
    const c = await claim(db, { post_type: "morning", for_date: today, user_id: u.id });
    if (!c.fresh) continue;
    const mine = await loadToday(db, { userId: u.id, scope: "mine", today, ctx });
    const due = mine.steps.filter((x) => x.bucket === "today");
    const r = await send(db, c.id, s.channel, personThread({
      person: { name: u.name, slackUserId: u.slack_user_id },
      dueToday: due.length,
      overdue: mine.header.overdue,
      replies: mine.header.replies,
      byChannel: { email: due.filter((x) => x.channel === "email").length, linkedin: due.filter((x) => x.channel.startsWith("linkedin")).length, call: due.filter((x) => x.channel === "call").length },
      focus: mine.focus.map((f) => ({ id: f.id, name: f.name, reason: f.reasons[0] ?? null })),
      needsReconnect: u.google_token_status === "expired",
    }, appUrl()), parentTs!);
    if (r.ok) threads.push(u.name);
  }
  return { posted: true, today, threads };
}

/** Reply alert, once per response. Never throws: Slack being down must not block a confirm. */
export async function sendReplyAlert(db: SupabaseClient, responseId: string) {
  try {
    const s = await settings(db);
    if (!s.enabled.reply_alert || !slackConfigured() || !s.channel) return { posted: false };
    const { data: r } = await db.from("responses").select("id, account_id, contact_id, track_id, classification, summary, channel, source, state").eq("id", responseId).single();
    if (!r?.account_id || r.state === "dismissed" || !alertWorthy(r.classification)) return { posted: false };
    const [{ data: a }, { data: c }, { data: t }] = await Promise.all([
      db.from("accounts").select("id, name, owner_id").eq("id", r.account_id).single(),
      r.contact_id ? db.from("contacts").select("full_name, persona").eq("id", r.contact_id).single() : Promise.resolve({ data: null }),
      r.track_id ? db.from("contact_tracks").select("persona").eq("id", r.track_id).single() : Promise.resolve({ data: null }),
    ]);
    const { data: owner } = a?.owner_id ? await db.from("users").select("name, slack_user_id").eq("id", a.owner_id).single() : { data: null };
    const cl = await claim(db, { post_type: "reply_alert", for_date: todayIn(), dedupe_key: responseId });
    if (!cl.fresh) return { posted: false };
    const sent = await send(db, cl.id, s.channel, replyAlert({
      responseId, accountId: a!.id, accountName: a!.name, contactName: c?.full_name ?? null, persona: t?.persona ?? c?.persona ?? null,
      classification: r.classification, summary: r.summary, channel: r.channel, source: r.source,
      owner: owner ? ({ name: owner.name, slackUserId: owner.slack_user_id } satisfies Person) : null,
    }, appUrl()));
    return { posted: sent.ok };
  } catch (e) {
    console.error("Slack reply alert failed:", e);
    return { posted: false };
  }
}

/** A one-line update about an account (tracks paused, meeting booked), once per key. Never throws. */
export async function postAccountNote(db: SupabaseClient, accountId: string, key: string, text: string) {
  try {
    const s = await settings(db);
    if (!slackConfigured() || !s.channel) return { posted: false };
    const { data: a } = await db.from("accounts").select("id, name, owner_id").eq("id", accountId).single();
    if (!a) return { posted: false };
    const { data: owner } = a.owner_id ? await db.from("users").select("name, slack_user_id").eq("id", a.owner_id).single() : { data: null };
    const cl = await claim(db, { post_type: "account_note", for_date: todayIn(), dedupe_key: key });
    if (!cl.fresh) return { posted: false };
    const who = owner ? (owner.slack_user_id ? `<@${owner.slack_user_id}>` : owner.name) : "";
    const link = `${appUrl()}/accounts/${a.id}`;
    const r = await send(db, cl.id, s.channel, { text: `${a.name}: ${text}`, blocks: [{ type: "section", text: { type: "mrkdwn", text: `*<${link}|${a.name.replace(/[<>&]/g, "")}>* · ${text}${who ? ` ${who}` : ""}` } }] });
    return { posted: r.ok };
  } catch (e) {
    console.error("Slack account note failed:", e);
    return { posted: false };
  }
}
