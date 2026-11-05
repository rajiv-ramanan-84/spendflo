import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Every change is logged (PRD section 4). Never throws: logging must not break the action. */
export async function logActivity(
  db: SupabaseClient,
  e: { entityType: string; entityId: string; action: string; actorId: string | null; before?: unknown; after?: unknown },
) {
  const { error } = await db.from("activity_log").insert({
    entity_type: e.entityType,
    entity_id: e.entityId,
    action: e.action,
    actor_id: e.actorId,
    before: e.before ?? null,
    after: e.after ?? null,
  });
  if (error) console.error("activity_log insert failed:", error.message);
}
