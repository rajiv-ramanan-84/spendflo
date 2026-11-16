import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { isFounderSignature } from "@/lib/playbook/founder";
import { ITEMS, openItems, type ChecklistItem, type Facts } from "./items";

/** What this person still has to do, with the app's own checks folded in. */
export async function loadChecklist(db: SupabaseClient, user: SessionUser): Promise<{ open: ChecklistItem[]; total: number }> {
  if (!user.id) return { open: [], total: 0 };
  const [{ data: u }, { data: ticks }, { data: sig }] = await Promise.all([
    db.from("users").select("google_token_status, slack_user_id, send_mailbox_id").eq("id", user.id).single(),
    db.from("user_checklist").select("item_key, done_at").eq("user_id", user.id),
    db.from("writing_rules").select("signature, version_no").eq("scope", "sender").eq("key", user.id).order("version_no", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const inboxes = [user.email];
  if (u?.send_mailbox_id) {
    const { data: m } = await db.from("mailboxes").select("email").eq("id", u.send_mailbox_id).maybeSingle();
    if (m?.email) inboxes.push(m.email as string);
  }
  const { count } = await db.from("linkedin_events").select("id", { count: "exact", head: true }).in("inbox", inboxes);
  const signature = (sig?.signature as string | null) ?? "";
  const facts: Facts = {
    gmailOk: u?.google_token_status === "ok",
    linkedinSeen: (count ?? 0) > 0,
    slackSet: !!u?.slack_user_id,
    signatureSet: signature.trim().length > 0,
    isFounder: isFounderSignature(signature),
    isAdmin: user.role === "admin",
  };
  const ticked = Object.fromEntries((ticks ?? []).map((t) => [t.item_key as string, t.done_at as string]));
  return { open: openItems(facts, ticked), total: ITEMS.filter((i) => i.audience === "all" || (i.audience === "admin" && facts.isAdmin) || (i.audience === "founder" && facts.isFounder)).length };
}
