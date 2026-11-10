import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { firstNameOf } from "./compose";
import { finishStep } from "./finish";
import { loadSigners } from "./rules";

const OPEN = ["upcoming", "due", "overdue"];

/**
 * Brings drafts written before the signing rules into line: the right name on every email and LinkedIn
 * message, a greeting and paragraphs on emails. Only steps nobody has edited by hand are touched, and
 * only the greeting, paragraphs and sign-off change. Safe to run any number of times.
 */
export async function resignOpenSteps(db: SupabaseClient): Promise<number> {
  const { data: steps } = await db.from("steps").select("id, channel, body, original_body, assignee_id, contact_id").in("status", OPEN).is("deleted_at", null).in("channel", ["email", "linkedin_connect", "linkedin_message", "linkedin_inmail"]).not("body", "is", null).limit(3000);
  const rows = (steps ?? []).filter((s) => s.original_body === s.body);
  if (!rows.length) return 0;
  const signers = await loadSigners(db, rows.map((s) => s.assignee_id as string).filter(Boolean));
  const { data: people } = await db.from("contacts").select("id, full_name").in("id", [...new Set(rows.map((s) => s.contact_id as string))]);
  const first = new Map((people ?? []).map((c) => [c.id as string, firstNameOf(c.full_name as string)]));
  let changed = 0;
  for (const s of rows) {
    const next = finishStep(s.channel as string, s.body as string, { firstName: first.get(s.contact_id as string) ?? null, assigneeId: (s.assignee_id as string | null) ?? null }, signers);
    if (next && next !== s.body) {
      await db.from("steps").update({ body: next, original_body: next }).eq("id", s.id);
      changed++;
    }
  }
  return changed;
}
