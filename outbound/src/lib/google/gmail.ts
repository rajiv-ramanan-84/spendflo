import "server-only";
import { OAuth2Client } from "google-auth-library";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, parseKey } from "@/lib/crypto/tokens";

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

export async function gmailAccessToken(db: SupabaseClient, userId: string): Promise<string> {
  if (LOCAL_MOCK) return `local-mock-token-${userId}`;
  const { data: u } = await db.from("users").select("google_refresh_token_enc, google_token_status").eq("id", userId).single();
  if (!u?.google_refresh_token_enc) throw new GoogleAuthError("Google is not connected for this person. Sign out and back in to reconnect Gmail.");
  const refreshToken = decryptToken(u.google_refresh_token_enc, parseKey(process.env.TOKEN_ENCRYPTION_KEY));
  const client = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  client.setCredentials({ refresh_token: refreshToken });
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("no token");
    if (u.google_token_status !== "ok") await db.from("users").update({ google_token_status: "ok" }).eq("id", userId);
    return token;
  } catch {
    await db.from("users").update({ google_token_status: "expired" }).eq("id", userId);
    throw new GoogleAuthError("Gmail access expired. Sign out and back in to reconnect; nothing was lost.");
  }
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
  payload?: { headers?: Array<{ name: string; value: string }>; mimeType?: string; body?: { data?: string }; parts?: GmailMessage["payload"][] };
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
