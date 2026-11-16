import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { canEditAdminSettings } from "@/lib/auth/session";
import { ActionError } from "@/lib/campaigns/actions";
import { logActivity } from "@/lib/activity/log";
import { decryptToken, encryptToken, parseKey } from "@/lib/crypto/tokens";
import { assertSafeUrl, callMcpTool, listMcpTools, toolHash } from "./mcp";
import { suggestLevel, type Level } from "./presets";

const keyOf = () => parseKey(process.env.TOKEN_ENCRYPTION_KEY);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "mcp";
const entity = (id: string) => id;

export type IntegrationRow = { id: string; key: string; name: string; preset: string | null; url: string; enabled: boolean; status: string; last_checked_at: string | null; last_error: string | null; hasToken: boolean };
export type ToolRow = { id: string; integration_id: string; name: string; description: string | null; level: Level; credits_estimate: number; needs_review: boolean };

export async function listIntegrations(db: SupabaseClient): Promise<{ integrations: IntegrationRow[]; tools: ToolRow[] }> {
  const [{ data: i }, { data: t }] = await Promise.all([
    db.from("integrations").select("id, key, name, preset, url, enabled, status, last_checked_at, last_error, token_enc").order("created_at"),
    db.from("integration_tools").select("id, integration_id, name, description, level, credits_estimate, needs_review").order("name"),
  ]);
  return {
    integrations: (i ?? []).map((r) => ({ id: r.id, key: r.key, name: r.name, preset: r.preset, url: r.url, enabled: r.enabled, status: r.status, last_checked_at: r.last_checked_at, last_error: r.last_error, hasToken: !!r.token_enc })),
    tools: (t ?? []).map((r) => ({ ...r, credits_estimate: Number(r.credits_estimate) })) as ToolRow[],
  };
}

function adminOnly(user: SessionUser) {
  if (!canEditAdminSettings(user)) throw new ActionError("Only admins can change integrations", 403);
}

export async function addIntegration(db: SupabaseClient, user: SessionUser, d: { name: string; url: string; token: string | null; preset: string | null }) {
  adminOnly(user);
  try { assertSafeUrl(d.url); } catch (e) { throw new ActionError((e as Error).message); }
  let key = slug(d.name);
  const { data: clash } = await db.from("integrations").select("id").eq("key", key).maybeSingle();
  if (clash) key = `${key}_${Math.random().toString(36).slice(2, 5)}`;
  const { data, error } = await db.from("integrations").insert({ key, name: d.name.trim(), preset: d.preset, url: d.url.trim(), token_enc: d.token ? encryptToken(d.token, keyOf()) : null, enabled: false, created_by: user.id }).select("id").single();
  if (error || !data) throw new ActionError(error?.message ?? "Could not add the integration", 500);
  await logActivity(db, { entityType: "integration", entityId: entity(data.id), action: "added", actorId: user.id, after: { name: d.name, url: d.url, preset: d.preset } });
  return { id: data.id as string };
}

export async function updateIntegration(db: SupabaseClient, user: SessionUser, id: string, d: { enabled?: boolean; url?: string; token?: string | null; name?: string }) {
  adminOnly(user);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.url !== undefined) { try { assertSafeUrl(d.url); } catch (e) { throw new ActionError((e as Error).message); } patch.url = d.url.trim(); patch.status = "untested"; }
  if (d.token !== undefined) { patch.token_enc = d.token ? encryptToken(d.token, keyOf()) : null; patch.status = "untested"; }
  if (d.name !== undefined) patch.name = d.name.trim();
  if (d.enabled !== undefined) {
    if (d.enabled) {
      const { data: cur } = await db.from("integrations").select("status").eq("id", id).single();
      if (cur?.status !== "ok") throw new ActionError("Test the connection first. It must pass before the integration can be switched on.");
    }
    patch.enabled = d.enabled;
  }
  const { error } = await db.from("integrations").update(patch).eq("id", id);
  if (error) throw new ActionError(error.message, 500);
  await logActivity(db, { entityType: "integration", entityId: entity(id), action: "updated", actorId: user.id, after: { ...d, token: d.token ? "[changed]" : undefined } });
}

export async function deleteIntegration(db: SupabaseClient, user: SessionUser, id: string) {
  adminOnly(user);
  await db.from("integrations").delete().eq("id", id);
  await logActivity(db, { entityType: "integration", entityId: entity(id), action: "removed", actorId: user.id });
}

async function creds(db: SupabaseClient, id: string) {
  const { data } = await db.from("integrations").select("id, key, preset, url, token_enc").eq("id", id).single();
  if (!data) throw new ActionError("Integration not found", 404);
  return { ...data, token: data.token_enc ? decryptToken(data.token_enc as string, keyOf()) : null };
}

/** Connects, lists the tools, and records them. A tool that is new or changed goes back to "needs review". */
export async function testIntegration(db: SupabaseClient, user: SessionUser, id: string) {
  adminOnly(user);
  const c = await creds(db, id);
  let tools;
  try {
    tools = await listMcpTools(c.url, c.token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not connect";
    await db.from("integrations").update({ status: "error", enabled: false, last_checked_at: new Date().toISOString(), last_error: msg.slice(0, 500) }).eq("id", id);
    throw new ActionError(`Could not connect: ${msg}`);
  }
  const { data: existing } = await db.from("integration_tools").select("id, name, schema_hash, level").eq("integration_id", id);
  const byName = new Map((existing ?? []).map((t) => [t.name as string, t]));
  let added = 0, changed = 0;
  for (const t of tools) {
    const h = toolHash(t);
    const cur = byName.get(t.name);
    if (!cur) {
      const s = suggestLevel(c.preset as string | null, t.name);
      await db.from("integration_tools").insert({ integration_id: id, name: t.name, description: t.description.slice(0, 2000), input_schema: t.inputSchema, schema_hash: h, level: s.level, credits_estimate: s.credits, needs_review: true });
      added++;
    } else if (cur.schema_hash !== h) {
      // The server changed this tool. It stops being usable until someone looks again.
      await db.from("integration_tools").update({ description: t.description.slice(0, 2000), input_schema: t.inputSchema, schema_hash: h, level: "blocked", needs_review: true, updated_at: new Date().toISOString() }).eq("id", cur.id);
      changed++;
    }
  }
  const names = new Set(tools.map((t) => t.name));
  const gone = (existing ?? []).filter((t) => !names.has(t.name as string)).map((t) => t.id);
  if (gone.length) await db.from("integration_tools").delete().in("id", gone);
  await db.from("integrations").update({ status: "ok", last_checked_at: new Date().toISOString(), last_error: null }).eq("id", id);
  await logActivity(db, { entityType: "integration", entityId: entity(id), action: "tested", actorId: user.id, after: { tools: tools.length, added, changed, removed: gone.length } });
  return { tools: tools.length, added, changed, removed: gone.length };
}

export async function setToolLevel(db: SupabaseClient, user: SessionUser, toolId: string, d: { level: Level; credits?: number }) {
  adminOnly(user);
  const { data: before } = await db.from("integration_tools").select("integration_id, name, level, credits_estimate").eq("id", toolId).single();
  if (!before) throw new ActionError("Tool not found", 404);
  const patch: Record<string, unknown> = { level: d.level, needs_review: false, updated_at: new Date().toISOString() };
  if (d.credits !== undefined) patch.credits_estimate = Math.max(0, d.credits);
  await db.from("integration_tools").update(patch).eq("id", toolId);
  await logActivity(db, { entityType: "integration", entityId: entity(before.integration_id as string), action: "tool_level", actorId: user.id, before: { tool: before.name, level: before.level }, after: { tool: before.name, level: d.level, credits: d.credits } });
}

export type IntegrationTool = { id: string; integrationId: string; integrationKey: string; integrationName: string; name: string; fullName: string; description: string; schema: Record<string, unknown>; level: Exclude<Level, "blocked">; credits: number };

/** The tools a run may use: enabled integration, reviewed, and not blocked. */
export async function activeIntegrationTools(db: SupabaseClient): Promise<IntegrationTool[]> {
  const { data: ints } = await db.from("integrations").select("id, key, name").eq("enabled", true).eq("status", "ok");
  if (!ints?.length) return [];
  const { data: tools } = await db.from("integration_tools").select("id, integration_id, name, description, input_schema, level, credits_estimate").in("integration_id", ints.map((i) => i.id)).eq("needs_review", false).neq("level", "blocked");
  const by = new Map(ints.map((i) => [i.id as string, i]));
  return (tools ?? []).map((t) => {
    const i = by.get(t.integration_id as string)!;
    return { id: t.id, integrationId: i.id, integrationKey: i.key, integrationName: i.name, name: t.name, fullName: `${i.key}__${t.name}`.slice(0, 64), description: (t.description as string | null) ?? "", schema: (t.input_schema as Record<string, unknown>) ?? { type: "object" }, level: t.level as "read" | "approve", credits: Number(t.credits_estimate) };
  });
}

export async function runIntegrationTool(db: SupabaseClient, integrationId: string, tool: string, args: Record<string, unknown>) {
  const c = await creds(db, integrationId);
  return callMcpTool(c.url, c.token, tool, args);
}
