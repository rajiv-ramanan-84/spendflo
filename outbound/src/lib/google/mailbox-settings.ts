import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mailboxRedirectUri } from "./mailbox-oauth";

export async function loadMailboxSettings(db: SupabaseClient) {
  const [{ data: mailboxes }, { data: users }] = await Promise.all([
    db.from("mailboxes").select("id, email, writes_as_user_id, google_token_status, connected_at").order("email"),
    db.from("users").select("id, name, email, send_mailbox_id").eq("active", true).order("name"),
  ]);
  const name = new Map((users ?? []).map((u) => [u.id, u.name as string]));
  return {
    redirectUri: mailboxRedirectUri(),
    users: (users ?? []).map((u) => ({ id: u.id as string, name: u.name as string, email: u.email as string, mailboxId: (u.send_mailbox_id as string | null) ?? null })),
    mailboxes: (mailboxes ?? []).map((m) => ({
      id: m.id as string, email: m.email as string, writesAs: name.get(m.writes_as_user_id as string) ?? "?", writesAsId: m.writes_as_user_id as string,
      status: m.google_token_status as string, connectedAt: (m.connected_at as string | null) ?? null,
      usedBy: (users ?? []).filter((u) => u.send_mailbox_id === m.id).map((u) => u.name as string),
    })),
  };
}
