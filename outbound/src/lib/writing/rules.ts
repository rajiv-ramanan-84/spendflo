import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings, type SessionUser } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";
import { EMPTY_RULES, type WritingRules } from "./compose";

export const PERSONAS: Array<{ key: string; label: string }> = [
  { key: "economic_buyer", label: "Economic buyer" },
  { key: "procurement_leader", label: "Procurement leader" },
  { key: "system_owner", label: "Coupa or system owner" },
  { key: "contract_manager", label: "Contract manager or legal ops" },
  { key: "legal", label: "Legal or GC" },
  { key: "finance_ap", label: "Finance or AP" },
  { key: "champion", label: "Champion" },
  { key: "other", label: "Other" },
];

type Row = { scope: string; key: string; version_no: number; instructions: string; signature: string | null; edited_by: string | null; created_at: string };

/** The newest version of every rule. */
export async function loadWritingRules(db: SupabaseClient): Promise<WritingRules> {
  const { data } = await db.from("writing_rules").select("scope, key, version_no, instructions, signature").order("version_no", { ascending: false }).limit(2000);
  const seen = new Set<string>();
  const rules: WritingRules = { ...EMPTY_RULES, personas: {}, senders: {} };
  for (const r of (data ?? []) as Row[]) {
    const id = `${r.scope}|${r.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (r.scope === "team") rules.team = r.instructions;
    else if (r.scope === "persona") rules.personas[r.key] = r.instructions;
    else if (r.scope === "sender") rules.senders[r.key] = { voice: r.instructions, signature: r.signature ?? "" };
  }
  return rules;
}

/** Everything the Settings screen shows: current text, who saved it, and the last few versions. */
export async function loadWritingSettings(db: SupabaseClient) {
  const [{ data: rows }, { data: users }] = await Promise.all([
    db.from("writing_rules").select("scope, key, version_no, instructions, signature, edited_by, created_at").order("version_no", { ascending: false }).limit(2000),
    db.from("users").select("id, name, active").eq("active", true).order("name"),
  ]);
  const name = new Map((users ?? []).map((u) => [u.id as string, u.name as string]));
  const history: Record<string, Array<{ versionNo: number; instructions: string; signature: string; editedBy: string | null; createdAt: string }>> = {};
  for (const r of (rows ?? []) as Row[]) {
    (history[`${r.scope}|${r.key}`] ??= []).push({ versionNo: r.version_no, instructions: r.instructions, signature: r.signature ?? "", editedBy: r.edited_by ? (name.get(r.edited_by) ?? null) : null, createdAt: r.created_at });
  }
  for (const k of Object.keys(history)) history[k] = history[k].slice(0, 8);
  return { personas: PERSONAS, senders: (users ?? []).map((u) => ({ id: u.id as string, name: u.name as string })), history };
}

export async function saveWritingRule(db: SupabaseClient, user: SessionUser, i: { scope: string; key: string; instructions: string; signature?: string | null }) {
  if (!canEditAdminSettings(user)) throw new ActionError("Only admins can change the writing rules", 403);
  if (!["team", "persona", "sender"].includes(i.scope)) throw new ActionError("Unknown rule type");
  if (i.scope === "team" && i.key !== "team") throw new ActionError("Unknown rule");
  if (i.scope === "persona" && !PERSONAS.some((p) => p.key === i.key)) throw new ActionError("Unknown persona");
  const instructions = i.instructions.replace(/\r\n/g, "\n").trim();
  const signature = i.scope === "sender" ? (i.signature ?? "").replace(/\r\n/g, "\n").trim() : null;
  if (instructions.length > 20_000) throw new ActionError("That is over 20,000 characters. Shorten it so Claude can follow it.");
  if (signature && signature.length > 500) throw new ActionError("A signature should be a few lines.");
  if (i.scope === "sender") {
    const { data: u } = await db.from("users").select("id").eq("id", i.key).eq("active", true).maybeSingle();
    if (!u) throw new ActionError("Unknown sender");
  }
  const { data: latest } = await db.from("writing_rules").select("version_no, instructions, signature").eq("scope", i.scope).eq("key", i.key).order("version_no", { ascending: false }).limit(1).maybeSingle();
  if (latest && latest.instructions === instructions && (latest.signature ?? null) === signature) throw new ActionError(`No changes: this is already version ${latest.version_no}.`);
  const versionNo = (latest?.version_no ?? 0) + 1;
  const { error } = await db.from("writing_rules").insert({ scope: i.scope, key: i.key, version_no: versionNo, instructions, signature, edited_by: user.id });
  if (error) throw new ActionError(error.code === "23505" ? "Someone saved at the same moment. Reload and try again." : error.message, 500);
  await logActivity(db, { entityType: "settings", entityId: user.id!, action: "writing_rules_updated", actorId: user.id, after: { scope: i.scope, key: i.key, versionNo } });
  return { versionNo };
}

/** The signature each assignee's emails carry: whoever's name their mailbox writes as, else their own. */
export async function senderSignatures(db: SupabaseClient, assigneeIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(assigneeIds)];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const [{ data: users }, { data: boxes }, rules] = await Promise.all([
    db.from("users").select("id, send_mailbox_id").in("id", ids),
    db.from("mailboxes").select("id, writes_as_user_id"),
    loadWritingRules(db),
  ]);
  const writesAs = new Map((boxes ?? []).map((m) => [m.id as string, m.writes_as_user_id as string]));
  for (const u of users ?? []) {
    const as = (u.send_mailbox_id && writesAs.get(u.send_mailbox_id as string)) || (u.id as string);
    const sig = rules.senders[as]?.signature;
    if (sig) out.set(u.id as string, sig);
  }
  return out;
}

/** First names of everyone on the team: the names Claude might sign with, and the ones the app strips and replaces. */
export async function teamFirstNames(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from("users").select("name");
  return [...new Set((data ?? []).map((u) => String(u.name).trim().split(/\s+/)[0]).filter((n) => n.length > 1))];
}

/** Each assignee's own first name: the person whose LinkedIn the message goes from. */
export async function ownFirstNames(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const want = [...new Set(ids)];
  if (!want.length) return out;
  const { data } = await db.from("users").select("id, name").in("id", want);
  for (const u of data ?? []) out.set(u.id as string, String(u.name).trim().split(/\s+/)[0]);
  return out;
}

/** The finished text of one step, signed by whoever sends it. Emails carry the mailbox's person, LinkedIn the sender's own name. */
export type Signers = { names: string[]; emailSig: Map<string, string>; own: Map<string, string> };
export async function loadSigners(db: SupabaseClient, assigneeIds: string[]): Promise<Signers> {
  const [names, emailSig, own] = await Promise.all([teamFirstNames(db), senderSignatures(db, assigneeIds), ownFirstNames(db, assigneeIds)]);
  return { names, emailSig, own };
}
