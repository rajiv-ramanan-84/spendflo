import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SessionUser } from "@/lib/auth/session";
import { canAssignAccounts } from "@/lib/auth/session";
import { ActionError } from "@/lib/campaigns/actions";
import { logActivity } from "@/lib/activity/log";
import { loadWritingRules, mailboxesRunBy, PERSONAS, saveWritingRule } from "@/lib/writing/rules";
import { canEditRule } from "@/lib/writing/access";
import { loadSlackSettings, saveSlackSettings } from "@/lib/slack/settings";
import { loadSpendSettings, saveSpendSettings } from "@/lib/claude/spend-settings";
import { loadSendingConfig, saveSendingConfig } from "@/lib/sending/config";
import { canSee, type Min } from "./nav";

/**
 * Settings the assistant can read and propose changes to. One entry per setting: where it lives, who may change it,
 * how to read it, and how to apply it using the same save code as the Settings page.
 * Left out on purpose: the assistant's own limits, integrations and their tools, tokens and keys, roles, and backups.
 */

export type Ctx = { db: SupabaseClient; user: SessionUser };
export type Area = "self" | "mailbox" | "team" | "admin";
export type SettingParams = { mailbox?: string; persona?: string };

export type SettingDef = {
  id: string;
  label: string;
  area: Area;
  href: string;
  readMin: Min;
  needs?: "mailbox" | "persona";
  hint: string;
  value: z.ZodTypeAny;
  scopeLabel?: (ctx: Ctx, p: SettingParams) => Promise<string>;
  read: (ctx: Ctx, p: SettingParams) => Promise<unknown>;
  can: (ctx: Ctx, p: SettingParams) => Promise<boolean>;
  apply: (ctx: Ctx, p: SettingParams, v: never) => Promise<void>;
};

const text = (max: number) => z.string().max(max);
const slackId = z.string().trim().regex(/^([UW][A-Z0-9]{6,20})?$/, "A Slack member ID looks like U0123ABCD");

/** A mailbox by id or by address, so the person can say "sid@". */
export async function resolveMailbox(db: SupabaseClient, ref: string | undefined): Promise<{ id: string; email: string } | null> {
  if (!ref) return null;
  const q = db.from("mailboxes").select("id, email");
  const { data } = /^[0-9a-f-]{36}$/i.test(ref) ? await q.eq("id", ref).maybeSingle() : await q.ilike("email", `%${ref.replace(/[%_]/g, "")}%`).limit(1).maybeSingle();
  return data ? { id: data.id as string, email: data.email as string } : null;
}

async function writeRule(ctx: Ctx, scope: "sender" | "mailbox" | "team" | "persona", key: string, field: "voice" | "signature" | "instructions", value: string) {
  const rules = await loadWritingRules(ctx.db);
  const cur = scope === "sender" ? rules.senders[key] : scope === "mailbox" ? rules.mailboxes[key] : undefined;
  const personal = scope === "sender" || scope === "mailbox";
  const instructions = personal ? (field === "voice" ? value : cur?.voice ?? "") : scope === "team" ? value : value;
  const signature = personal ? (field === "signature" ? value : cur?.signature ?? "") : null;
  await saveWritingRule(ctx.db, ctx.user, { scope, key, instructions, signature });
}

export const SETTINGS: SettingDef[] = [
  {
    id: "my_slack_id", label: "My Slack member ID", area: "self", href: "/settings/me", readMin: "all", hint: "So alerts @mention you.", value: slackId,
    read: async ({ db, user }) => (await db.from("users").select("slack_user_id").eq("id", user.id!).single()).data?.slack_user_id ?? "",
    can: async () => true,
    apply: async ({ db, user }, _p, v: string) => { await db.from("users").update({ slack_user_id: v || null }).eq("id", user.id!); await logActivity(db, { entityType: "settings", entityId: user.id!, action: "slack_id_updated", actorId: user.id, after: { set: !!v, via: "assistant" } }); },
  },
  {
    id: "my_voice", label: "My writing voice", area: "self", href: "/settings/me", readMin: "all", hint: "How Claude writes as me.", value: text(20000),
    read: async ({ db, user }) => (await loadWritingRules(db)).senders[user.id!]?.voice ?? "",
    can: async () => true,
    apply: async (ctx, _p, v: string) => writeRule(ctx, "sender", ctx.user.id!, "voice", v),
  },
  {
    id: "my_signature", label: "My signature", area: "self", href: "/settings/me", readMin: "all", hint: "Added to every email I send as myself.", value: text(500),
    read: async ({ db, user }) => (await loadWritingRules(db)).senders[user.id!]?.signature ?? "",
    can: async () => true,
    apply: async (ctx, _p, v: string) => writeRule(ctx, "sender", ctx.user.id!, "signature", v),
  },
  {
    id: "mailbox_voice", label: "Mailbox voice", area: "mailbox", needs: "mailbox", href: "/settings/writing/rules?tab=mailbox", readMin: "all", hint: "How mail sent from a mailbox I run sounds.", value: text(20000),
    scopeLabel: async ({ db }, p) => (await resolveMailbox(db, p.mailbox))?.email ?? "unknown mailbox",
    read: async ({ db }, p) => { const m = await resolveMailbox(db, p.mailbox); return m ? (await loadWritingRules(db)).mailboxes[m.id]?.voice ?? "" : null; },
    can: async ({ db, user }, p) => { const m = await resolveMailbox(db, p.mailbox); return !!m && canEditRule({ role: user.role, userId: user.id, scope: "mailbox", key: m.id, runsMailbox: (await mailboxesRunBy(db, user.id!)).includes(m.id) }); },
    apply: async (ctx, p, v: string) => { const m = await resolveMailbox(ctx.db, p.mailbox); if (!m) throw new ActionError("Unknown mailbox"); await writeRule(ctx, "mailbox", m.id, "voice", v); },
  },
  {
    id: "mailbox_signature", label: "Mailbox signature", area: "mailbox", needs: "mailbox", href: "/settings/writing/rules?tab=mailbox", readMin: "all", hint: "Signature on mail sent from a mailbox I run.", value: text(500),
    scopeLabel: async ({ db }, p) => (await resolveMailbox(db, p.mailbox))?.email ?? "unknown mailbox",
    read: async ({ db }, p) => { const m = await resolveMailbox(db, p.mailbox); return m ? (await loadWritingRules(db)).mailboxes[m.id]?.signature ?? "" : null; },
    can: async ({ db, user }, p) => { const m = await resolveMailbox(db, p.mailbox); return !!m && canEditRule({ role: user.role, userId: user.id, scope: "mailbox", key: m.id, runsMailbox: (await mailboxesRunBy(db, user.id!)).includes(m.id) }); },
    apply: async (ctx, p, v: string) => { const m = await resolveMailbox(ctx.db, p.mailbox); if (!m) throw new ActionError("Unknown mailbox"); await writeRule(ctx, "mailbox", m.id, "signature", v); },
  },
  {
    id: "team_writing_rules", label: "Team writing rules", area: "team", href: "/settings/writing/rules", readMin: "all", hint: "Instructions that apply to every email.", value: text(20000),
    read: async ({ db }) => (await loadWritingRules(db)).team,
    can: async ({ user }) => canAssignAccounts(user),
    apply: async (ctx, _p, v: string) => writeRule(ctx, "team", "team", "instructions", v),
  },
  {
    id: "persona_rules", label: "Persona writing rules", area: "team", needs: "persona", href: "/settings/writing/rules?tab=persona", readMin: "all", hint: "How to write to one kind of person.", value: text(20000),
    scopeLabel: async (_c, p) => PERSONAS.find((x) => x.key === p.persona)?.label ?? "unknown persona",
    read: async ({ db }, p) => (await loadWritingRules(db)).personas[p.persona ?? ""] ?? "",
    can: async ({ user }, p) => canAssignAccounts(user) && PERSONAS.some((x) => x.key === p.persona),
    apply: async (ctx, p, v: string) => writeRule(ctx, "persona", p.persona!, "instructions", v),
  },
  {
    id: "drafting_monthly_budget", label: "Monthly drafting budget (USD)", area: "admin", href: "/settings/ai/drafting", readMin: "manager", hint: "Drafts and re-plans pause when it is reached.", value: z.number().min(0).max(5000),
    read: async ({ db }) => (await loadSpendSettings(db)).budget,
    can: async ({ user }) => user.role === "admin",
    apply: async ({ db, user }, _p, v: number) => { const c = await loadSpendSettings(db); await saveSpendSettings(db, user, { autoDraft: c.autoDraft, budget: v, defaultModel: c.defaultModel as never, tierAModel: c.tierAModel as never, bulkMax: c.bulkMax }); },
  },
  {
    id: "drafting_auto_mode", label: "Automatic drafting", area: "admin", href: "/settings/ai/drafting", readMin: "manager", hint: "off, a (new Tier A accounts), ab (Tier A and B).", value: z.enum(["off", "a", "ab"]),
    read: async ({ db }) => (await loadSpendSettings(db)).autoDraft,
    can: async ({ user }) => user.role === "admin",
    apply: async ({ db, user }, _p, v: "off" | "a" | "ab") => { const c = await loadSpendSettings(db); await saveSpendSettings(db, user, { autoDraft: v, budget: c.budget, defaultModel: c.defaultModel as never, tierAModel: c.tierAModel as never, bulkMax: c.bulkMax }); },
  },
  {
    id: "slack_morning_time", label: "Slack morning plan time (IST, HH:MM)", area: "admin", href: "/settings/data/slack", readMin: "manager", hint: "Working days only.", value: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, for example 08:30"),
    read: async ({ db }) => (await loadSlackSettings(db)).morningTime,
    can: async ({ user }) => user.role === "admin",
    apply: async ({ db, user }, _p, v: string) => { const c = await loadSlackSettings(db); await saveSlackSettings(db, user, { channelId: c.channelId, morningTime: v, enabled: c.enabled, handles: [] }); },
  },
  {
    id: "send_max_per_address", label: "Daily maximum emails per address", area: "admin", href: "/settings/team/mailboxes", readMin: "manager", hint: "Sending from one address stops here each day (IST). Default 30.", value: z.number().int().min(1).max(500),
    read: async ({ db }) => (await loadSendingConfig(db)).perAddressMax,
    can: async ({ user }) => user.role === "admin",
    apply: async ({ db, user }, _p, v: number) => { await saveSendingConfig(db, user, { perAddressMax: v }); },
  },
  {
    id: "send_warn_at", label: "Sending warning level (emails per address per day)", area: "admin", href: "/settings/team/mailboxes", readMin: "manager", hint: "People are warned once an address goes past this. Default 25. Cannot be above the daily maximum.", value: z.number().int().min(1).max(500),
    read: async ({ db }) => (await loadSendingConfig(db)).warnAt,
    can: async ({ user }) => user.role === "admin",
    apply: async ({ db, user }, _p, v: number) => { await saveSendingConfig(db, user, { warnAt: v }); },
  },
  {
    id: "send_protect_core", label: "First emails from the company domain", area: "admin", href: "/settings/team/mailboxes", readMin: "manager", hint: "block, warn or off: whether a cold first email may go from the company domain once an outreach inbox exists.", value: z.enum(["block", "warn", "off"]),
    read: async ({ db }) => (await loadSendingConfig(db)).protectCore,
    can: async ({ user }) => user.role === "admin",
    apply: async ({ db, user }, _p, v: "block" | "warn" | "off") => { await saveSendingConfig(db, user, { protectCore: v }); },
  },
];

export const settingById = (id: string) => SETTINGS.find((s) => s.id === id);

/** Short text for an approval card: what changes, before to after. */
export function summarizeChange(label: string, scope: string | null, before: unknown, after: unknown): string {
  const f = (v: unknown) => { const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : String(v ?? ""); return s ? (s.length > 140 ? `${s.slice(0, 140)}... (${s.length} characters)` : s) : "(empty)"; };
  return `${label}${scope ? ` for ${scope}` : ""}: ${f(before)} to ${f(after)}`;
}

export async function visibleSettings(ctx: Ctx) {
  return SETTINGS.filter((s) => canSee(ctx.user.role, s.readMin));
}
