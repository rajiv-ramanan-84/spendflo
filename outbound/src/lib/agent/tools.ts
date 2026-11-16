import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/calendar/dates";
import type { AgentConfig } from "./config";
import { monthTotals } from "./store";

/** What the assistant can read in the app. Every one of these is read-only. Contact phone numbers are never selected. */

export type ToolCtx = { db: SupabaseClient; user: SessionUser; cfg: AgentConfig };
export type AgentTool = {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  run: (ctx: ToolCtx, input: never) => Promise<unknown>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lim = (n: number | undefined, def: number, max: number) => Math.min(Math.max(n ?? def, 1), max);
const cut = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n)}...` : s ?? null);

/** An account by id, or by name. If a name fits more than one account, the choices come back instead. */
async function resolveAccount(db: SupabaseClient, ref: string): Promise<{ id: string; name: string } | { choices: string[] } | { none: true }> {
  if (UUID.test(ref)) {
    const { data } = await db.from("accounts").select("id, name").eq("id", ref).is("deleted_at", null).maybeSingle();
    return data ? { id: data.id, name: data.name } : { none: true };
  }
  const { data } = await db.from("accounts").select("id, name").ilike("name", `%${ref.replace(/[%_]/g, "")}%`).is("deleted_at", null).limit(6);
  const rows = data ?? [];
  const exact = rows.find((r) => (r.name as string).toLowerCase() === ref.toLowerCase());
  if (exact) return { id: exact.id, name: exact.name };
  if (rows.length === 1) return { id: rows[0].id, name: rows[0].name };
  return rows.length ? { choices: rows.map((r) => r.name as string) } : { none: true };
}

const ownerNames = async (db: SupabaseClient, ids: Array<string | null>) => {
  const u = [...new Set(ids.filter((x): x is string => !!x))];
  if (!u.length) return new Map<string, string>();
  const { data } = await db.from("users").select("id, name").in("id", u);
  return new Map((data ?? []).map((x) => [x.id as string, x.name as string]));
};

const accountRef = z.string().min(1).describe("Account name or id");

export const BUILTIN_TOOLS: AgentTool[] = [
  {
    name: "search_accounts",
    description: "Find accounts by name, signal level (super_hot, hot, warm, nurture), tier (A to D), owner name, or whether a campaign exists. Returns up to 25 rows.",
    schema: z.object({ query: z.string().optional(), level: z.string().optional(), tier: z.string().optional(), owner: z.string().optional(), has_campaign: z.boolean().optional(), limit: z.number().optional() }),
    run: async ({ db }, i: { query?: string; level?: string; tier?: string; owner?: string; has_campaign?: boolean; limit?: number }) => {
      let q = db.from("accounts").select("id, name, tier, play, play_level, fit_level, fit_best_play, owner_id, start_by, status, do_not_contact").is("deleted_at", null).eq("archived", false);
      if (i.query) q = q.ilike("name", `%${i.query.replace(/[%_]/g, "")}%`);
      if (i.level) q = q.eq("play_level", i.level);
      if (i.tier) q = q.eq("tier", i.tier.toUpperCase());
      if (i.owner) {
        const { data: u } = await db.from("users").select("id").ilike("name", `%${i.owner.replace(/[%_]/g, "")}%`).limit(5);
        q = q.in("owner_id", (u ?? []).map((x) => x.id as string));
      }
      const { data } = await q.order("start_by", { ascending: true, nullsFirst: false }).limit(lim(i.limit, 15, 25) * (i.has_campaign === undefined ? 1 : 4));
      const rows = data ?? [];
      const { data: camps } = await db.from("campaigns").select("account_id, status").in("account_id", rows.map((r) => r.id as string)).is("deleted_at", null);
      const camp = new Map((camps ?? []).map((c) => [c.account_id as string, c.status as string]));
      const names = await ownerNames(db, rows.map((r) => r.owner_id as string | null));
      const out = rows.filter((r) => (i.has_campaign === undefined ? true : i.has_campaign === camp.has(r.id as string))).slice(0, lim(i.limit, 15, 25));
      return { count: out.length, accounts: out.map((r) => ({ id: r.id, name: r.name, tier: r.tier, play: r.play, level: r.play_level, fit: r.fit_level, best_fit_play: r.fit_best_play, owner: names.get(r.owner_id as string) ?? null, start_by: r.start_by, campaign: camp.get(r.id as string) ?? "none", do_not_contact: r.do_not_contact })) };
    },
  },
  {
    name: "get_account",
    description: "Everything the app knows about one account: profile, play and level, fit, recent signals, contact counts and campaign status.",
    schema: z.object({ account: accountRef }),
    run: async ({ db }, i: { account: string }) => {
      const a = await resolveAccount(db, i.account);
      if (!("id" in a)) return a;
      const [{ data: acc }, { data: sig }, { data: contacts }, { data: camp }] = await Promise.all([
        db.from("accounts").select("id, name, domain, segment, tier, icp_verdict, owner_id, status, revenue, employees, hq, ownership, coupa_evidence, trigger, trigger_date, outreach_angle, play, play_level, play_reasons, fit_level, fit_best_play, start_by, do_not_contact, disqualifier_flags").eq("id", a.id).single(),
        db.from("account_signals").select("signal_id, seen_on, evidence, source, expired").eq("account_id", a.id).eq("expired", false).order("seen_on", { ascending: false }).limit(10),
        db.from("contacts").select("persona, engagement_status").eq("account_id", a.id).is("deleted_at", null),
        db.from("campaigns").select("id, name, status, play, play_level, start_date").eq("account_id", a.id).is("deleted_at", null).maybeSingle(),
      ]);
      const names = await ownerNames(db, [acc?.owner_id as string | null]);
      const byPersona: Record<string, number> = {};
      for (const c of contacts ?? []) byPersona[(c.persona as string) ?? "unknown"] = (byPersona[(c.persona as string) ?? "unknown"] ?? 0) + 1;
      return { account: { ...acc, owner: names.get(acc?.owner_id as string) ?? null, owner_id: undefined }, signals: (sig ?? []).map((s) => ({ ...s, evidence: cut(s.evidence as string, 240) })), contacts: { total: contacts?.length ?? 0, by_persona: byPersona }, campaign: camp ?? null };
    },
  },
  {
    name: "list_contacts",
    description: "The contacts at an account: name, title, persona, engagement, whether there is an email and LinkedIn URL. Phone numbers are never shown.",
    schema: z.object({ account: accountRef, limit: z.number().optional() }),
    run: async ({ db }, i: { account: string; limit?: number }) => {
      const a = await resolveAccount(db, i.account);
      if (!("id" in a)) return a;
      const { data } = await db.from("contacts").select("id, full_name, title, persona, seniority, engagement_status, email, email_status, linkedin_url, do_not_contact, bounced, exclude").eq("account_id", a.id).is("deleted_at", null).limit(lim(i.limit, 30, 60));
      return { account: a.name, count: data?.length ?? 0, contacts: (data ?? []).map((c) => ({ id: c.id, name: c.full_name, title: c.title, persona: c.persona, seniority: c.seniority, engagement: c.engagement_status, has_email: !!c.email, email_status: c.email_status, linkedin_url: c.linkedin_url, do_not_contact: c.do_not_contact, bounced: c.bounced, excluded: c.exclude })) };
    },
  },
  {
    name: "list_campaigns",
    description: "Campaigns, newest first. Filter by status (draft, active, paused, responded, meeting_booked, closed) or owner name.",
    schema: z.object({ status: z.string().optional(), owner: z.string().optional(), limit: z.number().optional() }),
    run: async ({ db }, i: { status?: string; owner?: string; limit?: number }) => {
      let q = db.from("campaigns").select("id, name, status, play, play_level, owner_id, start_date, account_id, created_at").is("deleted_at", null);
      if (i.status) q = q.eq("status", i.status);
      if (i.owner) {
        const { data: u } = await db.from("users").select("id").ilike("name", `%${i.owner.replace(/[%_]/g, "")}%`).limit(5);
        q = q.in("owner_id", (u ?? []).map((x) => x.id as string));
      }
      const { data } = await q.order("created_at", { ascending: false }).limit(lim(i.limit, 15, 30));
      const rows = data ?? [];
      const [names, { data: accts }] = await Promise.all([ownerNames(db, rows.map((r) => r.owner_id as string | null)), db.from("accounts").select("id, name").in("id", rows.map((r) => r.account_id as string))]);
      const an = new Map((accts ?? []).map((a) => [a.id as string, a.name as string]));
      return { count: rows.length, campaigns: rows.map((r) => ({ id: r.id, account: an.get(r.account_id as string) ?? null, name: r.name, status: r.status, play: r.play, level: r.play_level, owner: names.get(r.owner_id as string) ?? null, start_date: r.start_date })) };
    },
  },
  {
    name: "get_campaign",
    description: "The plan for an account's campaign: every step with date, channel, status and contact. Set include_bodies to read the draft text (shortened).",
    schema: z.object({ account: accountRef, include_bodies: z.boolean().optional() }),
    run: async ({ db }, i: { account: string; include_bodies?: boolean }) => {
      const a = await resolveAccount(db, i.account);
      if (!("id" in a)) return a;
      const { data: c } = await db.from("campaigns").select("id, name, status, objective, angle, job, play, play_level, start_date, current_version").eq("account_id", a.id).is("deleted_at", null).maybeSingle();
      if (!c) return { account: a.name, campaign: null };
      const { data: steps } = await db.from("steps").select("sequence_no, channel, due_date, status, subject, body, contact_id").eq("campaign_id", c.id).is("deleted_at", null).neq("status", "superseded").order("due_date", { nullsFirst: false }).limit(80);
      const { data: people } = await db.from("contacts").select("id, full_name").in("id", [...new Set((steps ?? []).map((s) => s.contact_id as string))]);
      const pn = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));
      return { account: a.name, campaign: c, steps: (steps ?? []).map((s) => ({ contact: pn.get(s.contact_id as string) ?? null, n: s.sequence_no, channel: s.channel, due: s.due_date, status: s.status, subject: s.subject, ...(i.include_bodies ? { body: cut(s.body as string, 500) } : {}) })) };
    },
  },
  {
    name: "my_tasks",
    description: "The signed-in person's open steps due today or earlier, plus anything due within the next few days.",
    schema: z.object({ days_ahead: z.number().optional() }),
    run: async ({ db, user }, i: { days_ahead?: number }) => {
      const today = todayIn();
      const end = new Date(Date.parse(`${today}T00:00:00Z`) + lim(i.days_ahead, 0, 14) * 86400000).toISOString().slice(0, 10);
      const { data } = await db.from("steps").select("channel, due_date, status, subject, contact_id, campaign_id").eq("assignee_id", user.id!).in("status", ["upcoming", "due", "overdue"]).lte("due_date", end).is("deleted_at", null).order("due_date").limit(40);
      const rows = data ?? [];
      const [{ data: people }, { data: camps }] = await Promise.all([db.from("contacts").select("id, full_name").in("id", rows.map((r) => r.contact_id as string)), db.from("campaigns").select("id, account_id").in("id", rows.map((r) => r.campaign_id as string))]);
      const { data: accts } = await db.from("accounts").select("id, name").in("id", (camps ?? []).map((c) => c.account_id as string));
      const pn = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));
      const an = new Map((accts ?? []).map((a) => [a.id as string, a.name as string]));
      const cn = new Map((camps ?? []).map((c) => [c.id as string, an.get(c.account_id as string) ?? null]));
      return { today, count: rows.length, tasks: rows.map((r) => ({ due: r.due_date, status: r.status, channel: r.channel, contact: pn.get(r.contact_id as string) ?? null, account: cn.get(r.campaign_id as string) ?? null, subject: r.subject })) };
    },
  },
  {
    name: "recent_replies",
    description: "Replies and bounces the app has detected, newest first, with how each was classified and whether it is waiting for confirmation.",
    schema: z.object({ days: z.number().optional(), limit: z.number().optional() }),
    run: async ({ db }, i: { days?: number; limit?: number }) => {
      const since = new Date(Date.now() - lim(i.days, 14, 90) * 86400000).toISOString();
      const { data } = await db.from("responses").select("id, state, classification, confidence, summary, received_at, channel, account_id, contact_id").gte("received_at", since).order("received_at", { ascending: false }).limit(lim(i.limit, 15, 40));
      const rows = data ?? [];
      const [{ data: accts }, { data: people }] = await Promise.all([db.from("accounts").select("id, name").in("id", rows.map((r) => r.account_id as string).filter(Boolean)), db.from("contacts").select("id, full_name").in("id", rows.map((r) => r.contact_id as string).filter(Boolean))]);
      const an = new Map((accts ?? []).map((a) => [a.id as string, a.name as string]));
      const pn = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));
      return { count: rows.length, replies: rows.map((r) => ({ received: r.received_at, channel: r.channel, account: an.get(r.account_id as string) ?? null, contact: pn.get(r.contact_id as string) ?? null, classification: r.classification, state: r.state, summary: r.summary })) };
    },
  },
  {
    name: "linkedin_activity",
    description: "What the mail scan did with LinkedIn emails (accepted invites, messages): who, which account, what was applied.",
    schema: z.object({ limit: z.number().optional() }),
    run: async ({ db }, i: { limit?: number }) => {
      const { data } = await db.from("linkedin_events").select("kind, status, person_name, headline, detail, received_at, account_id").order("received_at", { ascending: false }).limit(lim(i.limit, 15, 40));
      const { data: accts } = await db.from("accounts").select("id, name").in("id", (data ?? []).map((r) => r.account_id as string).filter(Boolean));
      const an = new Map((accts ?? []).map((a) => [a.id as string, a.name as string]));
      return { events: (data ?? []).map((r) => ({ at: r.received_at, kind: r.kind, status: r.status, person: r.person_name, account: an.get(r.account_id as string) ?? null, detail: r.detail })) };
    },
  },
  {
    name: "spend_summary",
    description: "What the assistant has spent this month on Claude and Tapistro credits, against its limits.",
    schema: z.object({}),
    run: async ({ db, cfg }) => {
      const t = await monthTotals(db);
      return { claude_usd: { spent: t.usd, limit: cfg.claudeMonthlyUsd }, tapistro_credits: { spent: t.credits, limit: cfg.tapistroMonthlyCredits }, per_request: { usd: cfg.runCapUsd, credits: cfg.runCapCredits } };
    },
  },
];

export function jsonSchemaOf(t: AgentTool): Record<string, unknown> {
  const s = z.toJSONSchema(t.schema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}
