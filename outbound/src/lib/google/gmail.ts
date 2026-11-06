import "server-only";
import { OAuth2Client } from "google-auth-library";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, parseKey } from "@/lib/crypto/tokens";
import type { MessagePart } from "@/lib/responses/parse";

/**
 * Gmail on behalf of one user, with that user's own stored refresh token.
 * Drafts land in the sender's own mailbox; nothing is ever sent from here.
 */

/**
 * Local end-to-end checks only: when GMAIL_API_BASE points at 127.0.0.1 the
 * client talks to a local mock and skips the OAuth exchange. Any other value
 * is ignored, so production always uses Google.
 */
const LOCAL_MOCK = process.env.GMAIL_API_BASE?.startsWith("http://127.0.0.1:") ? process.env.GMAIL_API_BASE : null;
const API = LOCAL_MOCK ? `${LOCAL_MOCK}/gmail/v1/users/me` : "https://gmail.googleapis.com/gmail/v1/users/me";

export class GoogleAuthError extends Error {}

async function exchange(refreshEnc: string | null, onExpired: () => PromiseLike<unknown>, onOk: () => PromiseLike<unknown>, missing: string): Promise<string> {
  if (!refreshEnc) throw new GoogleAuthError(missing);
  const refreshToken = decryptToken(refreshEnc, parseKey(process.env.TOKEN_ENCRYPTION_KEY));
  const client = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  client.setCredentials({ refresh_token: refreshToken });
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("no token");
    await onOk();
    return token;
  } catch {
    await onExpired();
    throw new GoogleAuthError("Gmail access expired. Reconnect it; nothing was lost.");
  }
}

export async function gmailAccessToken(db: SupabaseClient, userId: string): Promise<string> {
  if (LOCAL_MOCK) return `local-mock-token-${userId}`;
  const { data: u } = await db.from("users").select("google_refresh_token_enc, google_token_status").eq("id", userId).single();
  return exchange(
    u?.google_refresh_token_enc ?? null,
    () => db.from("users").update({ google_token_status: "expired" }).eq("id", userId),
    async () => { if (u?.google_token_status !== "ok") await db.from("users").update({ google_token_status: "ok" }).eq("id", userId); },
    "Google is not connected for this person. Sign out and back in to reconnect Gmail.",
  );
}

export async function mailboxAccessToken(db: SupabaseClient, mailboxId: string): Promise<string> {
  if (LOCAL_MOCK) return `local-mock-token-mailbox-${mailboxId}`;
  const { data: m } = await db.from("mailboxes").select("email, google_refresh_token_enc, google_token_status").eq("id", mailboxId).single();
  return exchange(
    m?.google_refresh_token_enc ?? null,
    () => db.from("mailboxes").update({ google_token_status: "expired" }).eq("id", mailboxId),
    async () => { if (m?.google_token_status !== "ok") await db.from("mailboxes").update({ google_token_status: "ok" }).eq("id", mailboxId); },
    `The ${m?.email ?? "shared"} mailbox is not connected. An admin can connect it in Settings > Mailboxes.`,
  );
}

/**
 * Who an email is from when this person sends it. Their own Gmail by
 * default; a shared mailbox (e.g. sid@ run by Mouli) when Settings says so,
 * written in that mailbox's person's name.
 */
export type Sender = { mailboxId: string | null; email: string; name: string; operatorId: string; token: () => Promise<string> };

export async function senderFor(db: SupabaseClient, userId: string): Promise<Sender> {
  const { data: u } = await db.from("users").select("id, email, name, send_mailbox_id").eq("id", userId).single();
  if (!u) throw new GoogleAuthError("Sender not found");
  if (u.send_mailbox_id) {
    const { data: m } = await db.from("mailboxes").select("id, email, writes_as_user_id").eq("id", u.send_mailbox_id).single();
    if (m) {
      const { data: persona } = await db.from("users").select("name").eq("id", m.writes_as_user_id).single();
      return { mailboxId: m.id, email: m.email, name: persona?.name ?? u.name, operatorId: u.id, token: () => mailboxAccessToken(db, m.id) };
    }
  }
  return { mailboxId: null, email: u.email, name: u.name, operatorId: u.id, token: () => gmailAccessToken(db, u.id) };
}

async function gmail<T>(token: string, path: string, init?: RequestInit): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (res.status === 404) return { status: 404, data: null };
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { status: res.status, data: (await res.json()) as T };
}

export type GmailDraft = { id: string; message: { id: string; threadId: string } };

export async function createDraft(token: string, raw: string, threadId?: string | null): Promise<GmailDraft> {
  const r = await gmail<GmailDraft>(token, "/drafts", { method: "POST", body: JSON.stringify({ message: { raw, ...(threadId ? { threadId } : {}) } }) });
  return r.data!;
}

/** Replaces the draft's content. Returns null if the draft no longer exists (deleted or sent). */
export async function updateDraft(token: string, draftId: string, raw: string, threadId?: string | null): Promise<GmailDraft | null> {
  const r = await gmail<GmailDraft>(token, `/drafts/${encodeURIComponent(draftId)}`, { method: "PUT", body: JSON.stringify({ id: draftId, message: { raw, ...(threadId ? { threadId } : {}) } }) });
  return r.data;
}

export async function getDraft(token: string, draftId: string): Promise<GmailDraft | null> {
  return (await gmail<GmailDraft>(token, `/drafts/${encodeURIComponent(draftId)}?format=minimal`)).data;
}

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
  payload?: MessagePart;
};

export async function getMessage(token: string, id: string): Promise<GmailMessage | null> {
  return (await gmail<GmailMessage>(token, `/messages/${encodeURIComponent(id)}?format=full`)).data;
}

export async function getThread(token: string, threadId: string): Promise<{ id: string; messages: GmailMessage[] } | null> {
  return (await gmail<{ id: string; messages: GmailMessage[] }>(token, `/threads/${encodeURIComponent(threadId)}?format=full`)).data;
}

export async function listMessageIds(token: string, q: string, max = 50): Promise<string[]> {
  const r = await gmail<{ messages?: Array<{ id: string }> }>(token, `/messages?q=${encodeURIComponent(q)}&maxResults=${max}`);
  return (r.data?.messages ?? []).map((m) => m.id);
}
