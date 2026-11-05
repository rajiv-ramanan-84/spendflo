import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After a response is recorded: badge for the owner. The Slack reply alert
 * hooks in here (milestone 9).
 */
export async function notifyResponse(db: SupabaseClient, responseId: string) {
  const { data: r } = await db.from("responses").select("id, account_id, summary").eq("id", responseId).single();
  if (!r?.account_id) return;
  const { data: a } = await db.from("accounts").select("owner_id, name").eq("id", r.account_id).single();
  if (a?.owner_id) {
    await db.from("notifications").insert({ user_id: a.owner_id, type: "reply", entity_type: "response", entity_id: r.id, message: `${a.name}: ${r.summary ?? "new reply"}` });
  }
}
