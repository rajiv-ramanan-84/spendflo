import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { ActionError } from "@/lib/campaigns/actions";
import { tokensForChars } from "@/lib/claude/pricing";
import { redactCounted } from "./redact";

/**
 * Files attached in the assistant. The browser reads the file and sends only its text. The server removes
 * phone numbers and personal emails again, keeps the redacted text in the database, and never sees the original.
 * After 30 days a file is archived: it leaves the recent list but stays in the library and can be attached again.
 */

export const MAX_CHARS = 400_000;
export const MAX_ACTIVE_FILES = 80;
export const ARCHIVE_AFTER_DAYS = 30;

export type FileRow = { id: string; name: string; mime: string | null; chars: number; tokens_est: number; pages: number | null; phones_removed: number; emails_removed: number; truncated: boolean; created_at: string; archived_at: string | null };
const COLS = "id, name, mime, chars, tokens_est, pages, phones_removed, emails_removed, truncated, created_at, archived_at";

export async function saveFile(db: SupabaseClient, user: SessionUser, d: { name: string; mime?: string | null; sizeBytes?: number; pages?: number | null; text: string }): Promise<FileRow> {
  const name = d.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
  if (!name) throw new ActionError("The file needs a name");
  if (!d.text.trim()) throw new ActionError("No text could be read from that file. Scanned pages and images need a different route.");
  const { count } = await db.from("agent_files").select("id", { count: "exact", head: true }).eq("user_id", user.id!).is("archived_at", null);
  if ((count ?? 0) >= MAX_ACTIVE_FILES) throw new ActionError(`You have ${MAX_ACTIVE_FILES} recent files. Delete a few first.`);
  const r = redactCounted(d.text.replace(/\u0000/g, ""));
  const truncated = r.text.length > MAX_CHARS;
  const content = truncated ? r.text.slice(0, MAX_CHARS) : r.text;
  const { data, error } = await db.from("agent_files").insert({ user_id: user.id, name, mime: d.mime ?? null, size_bytes: d.sizeBytes ?? 0, pages: d.pages ?? null, chars: content.length, tokens_est: tokensForChars(content.length), content, phones_removed: r.phones, emails_removed: r.emails, truncated }).select(COLS).single();
  if (error || !data) throw new ActionError(error?.message ?? "Could not save the file", 500);
  return data as FileRow;
}

export async function listFiles(db: SupabaseClient, user: SessionUser, o: { archived?: boolean; q?: string } = {}): Promise<FileRow[]> {
  let q = db.from("agent_files").select(COLS).eq("user_id", user.id!).order("created_at", { ascending: false }).limit(60);
  q = o.archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  if (o.q) q = q.ilike("name", `%${o.q.replace(/[%_]/g, "")}%`);
  const { data } = await q;
  return (data ?? []) as FileRow[];
}

/** The person's own files, with their text, for one request. */
export async function loadFilesFor(db: SupabaseClient, user: SessionUser, ids: string[]) {
  if (!ids.length) return [];
  const { data } = await db.from("agent_files").select("id, name, chars, tokens_est, content, truncated").eq("user_id", user.id!).in("id", ids.slice(0, 8));
  if ((data?.length ?? 0) !== new Set(ids.slice(0, 8)).size) throw new ActionError("One of the attached files was not found. Attach it again.", 404);
  await db.from("agent_files").update({ last_used_at: new Date().toISOString(), archived_at: null }).in("id", ids.slice(0, 8));
  return (data ?? []) as Array<{ id: string; name: string; chars: number; tokens_est: number; content: string; truncated: boolean }>;
}

export async function deleteFile(db: SupabaseClient, user: SessionUser, id: string) {
  await db.from("agent_files").delete().eq("id", id).eq("user_id", user.id!);
}

/** Daily: files older than 30 days move out of the recent list. Their text stays in the database. */
export async function archiveOldFiles(db: SupabaseClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - ARCHIVE_AFTER_DAYS * 86_400_000).toISOString();
  const { data } = await db.from("agent_files").update({ archived_at: now.toISOString() }).is("archived_at", null).lt("created_at", cutoff).select("id");
  return { archived: data?.length ?? 0 };
}
