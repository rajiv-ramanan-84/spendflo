import "server-only";

/**
 * Minimal Slack Web API client: chat.postMessage to one channel.
 * SLACK_API_BASE pointing at 127.0.0.1 is for local checks only.
 */
const LOCAL = process.env.SLACK_API_BASE?.startsWith("http://127.0.0.1:") ? process.env.SLACK_API_BASE : null;
const API = LOCAL ?? "https://slack.com/api";

export type PostResult = { ok: true; ts: string; channel: string } | { ok: false; error: string };

export function slackConfigured() {
  return !!process.env.SLACK_BOT_TOKEN;
}

export async function postMessage(channel: string, msg: { text: string; blocks: unknown[] }, threadTs?: string): Promise<PostResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "not_configured" };
  const res = await fetch(`${API}/chat.postMessage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel, text: msg.text, blocks: msg.blocks, unfurl_links: false, unfurl_media: false, ...(threadTs ? { thread_ts: threadTs } : {}) }),
  });
  const data = (await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }))) as { ok: boolean; ts?: string; channel?: string; error?: string };
  return data.ok ? { ok: true, ts: data.ts!, channel: data.channel ?? channel } : { ok: false, error: data.error ?? "unknown" };
}
