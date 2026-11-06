import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings, type SessionUser } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";
import { skillWarnings } from "./system-prompt";

/**
 * The team's campaign skill, versioned. Every draft records which version
 * wrote it. The app's own notes and the outbound brief are added at call time,
 * so an upload here can change the writing freely without breaking the app.
 */

export async function loadSkillSettings(db: SupabaseClient) {
  const [{ data: versions }, { data: users }] = await Promise.all([
    db.from("skill_versions").select("id, version_no, body, edited_by, created_at").order("version_no", { ascending: false }).limit(10),
    db.from("users").select("id, name"),
  ]);
  const name = new Map((users ?? []).map((u) => [u.id, u.name as string]));
  const list = (versions ?? []).map((v) => ({
    versionNo: v.version_no as number,
    chars: (v.body as string).length,
    editedBy: v.edited_by ? (name.get(v.edited_by) ?? null) : null,
    createdAt: v.created_at as string,
  }));
  return { current: list[0] ?? null, history: list, warnings: skillWarnings((versions?.[0]?.body as string) ?? "") };
}

export async function saveSkill(db: SupabaseClient, user: SessionUser, text: string) {
  if (!canEditAdminSettings(user)) throw new ActionError("Only admins can change the campaign skill", 403);
  const body = text.replace(/\r\n/g, "\n").trim();
  if (body.length < 500) throw new ActionError("That looks too short to be the full skill. Upload the whole SKILL.md file.");
  if (body.length > 200_000) throw new ActionError("That file is over 200,000 characters. Check you uploaded the skill, not something else.");
  const { data: latest } = await db.from("skill_versions").select("version_no, body").order("version_no", { ascending: false }).limit(1).maybeSingle();
  if (latest && latest.body === body) throw new ActionError(`No changes: this is already version ${latest.version_no}.`);
  const versionNo = (latest?.version_no ?? 0) + 1;
  const { error } = await db.from("skill_versions").insert({ version_no: versionNo, body, edited_by: user.id });
  if (error) throw new ActionError(error.code === "23505" ? "Someone saved a version at the same moment. Reload and try again." : error.message, 500);
  await logActivity(db, { entityType: "settings", entityId: user.id!, action: "skill_updated", actorId: user.id, after: { versionNo, chars: body.length } });
  return { versionNo, warnings: skillWarnings(body) };
}

export async function skillText(db: SupabaseClient, versionNo?: number) {
  let q = db.from("skill_versions").select("version_no, body").order("version_no", { ascending: false }).limit(1);
  if (versionNo) q = db.from("skill_versions").select("version_no, body").eq("version_no", versionNo).limit(1);
  const { data } = await q.maybeSingle();
  return data ? { versionNo: data.version_no as number, body: data.body as string } : null;
}
