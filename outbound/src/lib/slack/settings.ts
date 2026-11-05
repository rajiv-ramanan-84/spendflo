import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings, type SessionUser } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";
import { postMessage, slackConfigured } from "./client";

export const SlackSettingsInput = z.object({
  channelId: z.string().trim().regex(/^[CG][A-Z0-9]{6,}$/, "Channel ID looks like C0123ABCD (right-click the channel, Copy link)").or(z.literal("")),
  morningTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  enabled: z.object({ morning: z.boolean(), reply_alert: z.boolean() }),
  handles: z.array(z.object({ userId: z.string().uuid(), slackUserId: z.string().trim().regex(/^[UW][A-Z0-9]{6,}$/, "Slack member IDs look like U0123ABCD").or(z.literal("")) })),
});

export async function loadSlackSettings(db: SupabaseClient) {
  const [{ data: s }, { data: users }] = await Promise.all([
    db.from("app_settings").select("slack_channel_id, slack_post_times, slack_posts_enabled").single(),
    db.from("users").select("id, name, email, slack_user_id").eq("active", true).order("name"),
  ]);
  return {
    channelId: (s?.slack_channel_id as string | null) ?? "",
    envChannel: !!process.env.SLACK_CHANNEL_ID,
    connected: slackConfigured(),
    morningTime: (s?.slack_post_times as { morning?: string })?.morning ?? "08:30",
    enabled: { morning: !!(s?.slack_posts_enabled as Record<string, boolean>)?.morning, reply_alert: !!(s?.slack_posts_enabled as Record<string, boolean>)?.reply_alert },
    users: (users ?? []).map((u) => ({ id: u.id as string, name: u.name as string, email: u.email as string, slackUserId: (u.slack_user_id as string | null) ?? "" })),
  };
}

export async function saveSlackSettings(db: SupabaseClient, user: SessionUser, input: z.infer<typeof SlackSettingsInput>) {
  if (!canEditAdminSettings(user)) throw new ActionError("Only admins can change Slack settings", 403);
  const { data: cur } = await db.from("app_settings").select("slack_post_times, slack_posts_enabled").single();
  await db.from("app_settings").update({
    slack_channel_id: input.channelId || null,
    slack_post_times: { ...(cur?.slack_post_times ?? {}), morning: input.morningTime },
    slack_posts_enabled: { ...(cur?.slack_posts_enabled ?? {}), ...input.enabled },
    updated_by: user.id,
  }).eq("id", true);
  for (const h of input.handles) await db.from("users").update({ slack_user_id: h.slackUserId || null }).eq("id", h.userId);
  await logActivity(db, { entityType: "settings", entityId: user.id!, action: "slack_updated", actorId: user.id, after: { channel: input.channelId, morning: input.morningTime, enabled: input.enabled } });
  return {};
}

export async function sendTestPost(db: SupabaseClient, user: SessionUser) {
  if (!canEditAdminSettings(user)) throw new ActionError("Only admins can send a test post", 403);
  const s = await loadSlackSettings(db);
  const channel = s.channelId || process.env.SLACK_CHANNEL_ID;
  if (!s.connected) throw new ActionError("SLACK_BOT_TOKEN is not set on the server yet");
  if (!channel) throw new ActionError("Add the channel ID first");
  const tagged = s.users.filter((u) => u.slackUserId).map((u) => `<@${u.slackUserId}>`).join(" ");
  const r = await postMessage(channel, { text: "Outbound Command Center is connected.", blocks: [{ type: "section", text: { type: "mrkdwn", text: `:wave: Outbound Command Center is connected. Morning plan at ${s.morningTime} IST on working days.${tagged ? `\n${tagged}` : ""}` } }] });
  if (!r.ok) throw new ActionError(r.error === "not_in_channel" ? "The bot is not in that channel yet. In Slack, type /invite @your-bot in the channel." : `Slack said: ${r.error}`);
  return {};
}
