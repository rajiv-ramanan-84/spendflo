import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/calendar/dates";
import { loadCalendarContext } from "@/lib/calendar/context";
import { loadToday } from "@/lib/data/today";
import { VIEWS, inView } from "@/lib/tasks/view";
import type { AgentConfig } from "./config";
import { monthTotals } from "./store";
import { listFiles } from "./files";
import { resolveMailbox, settingById, summarizeChange, visibleSettings } from "@/lib/settings/registry";
import { loadHealth } from "@/lib/settings/health-load";
import { proposeSettingAction } from "./actions";
import { allMailboxUsage, inboxesForUser } from "@/lib/sending/usage";

/** What the assistant can read in the app. Every one of these is read-only. Contact phone numbers are never selected. */

export type ToolCtx = {
  db: SupabaseClient;
  user: SessionUser;
  cfg: AgentConfig;
  /** Present during a chat run, so a tool can put a proposal in front of the person. */
  run?: { runId: string; threadId: string; onAction: (a: { id: string; title: string; summary: string; settingId: string; input: unknown }) => void };
};
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
    description: "The Tasks page, exactly as the person sees it: counts for Overdue, Today, Next 7 days and All open, replies waiting, and the tasks in a view. Only steps of live campaigns with an active track count, as on the page. Use scope team for everyone's tasks.",
    schema: z.object({ view: z.enum(["overdue", "today", "next7", "all"]).optional(), scope: z.enum(["mine", "team"]).optional(), limit: z.number().optional() }),
    run: async ({ db, user }, i: { view?: "overdue" | "today" | "next7" | "all"; scope?: "mine" | "team"; limit?: number }) => {
      const today = todayIn();
      const year = Number(today.slice(0, 4));
      const ctx = await loadCalendarContext(db, [year, year + 1]);
      const data = await loadToday(db, { userId: user.id, scope: i.scope ?? "mine", today, ctx });
      const tasks = data.steps;
      const counts = Object.fromEntries(VIEWS.map((v) => [v.id, tasks.filter((t) => inView(t, v.id)).length]));
      // With no view asked for, show what needs attention now: overdue first, then today.
      const wanted = i.view ? tasks.filter((t) => inView(t, i.view!)) : tasks.filter((t) => t.bucket === "overdue" || t.bucket === "today");
      return {
        today, scope: i.scope ?? "mine", tabs: counts, replies_waiting: data.replies.length, accounts_to_start_now: data.urgent.map((u) => ({ account: u.name, level: u.level, start_by: u.startBy })),
        showing: i.view ?? "overdue and today", count: wanted.length,
        tasks: wanted.slice(0, lim(i.limit, 25, 50)).map((t) => ({ bucket: t.bucket, due: t.due_date, state: t.state, reason: t.state_reason, channel: t.channel, contact: t.contact.full_name, account: t.account.name, tier: t.account.tier, subject: t.subject })),
      };
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
    name: "sending_status",
    description: "How many emails each inbox has sent today against the warning level and the daily maximum, what is still due today, whether an inbox is warming up or paused, and which inbox has room. Use for 'how many can I still send', 'which inbox should I use', 'is the domain safe'. scope team (managers and admins) lists every connected mailbox.",
    schema: z.object({ scope: z.enum(["mine", "team"]).optional() }),
    run: async ({ db, user }, i: { scope?: "mine" | "team" }) => {
      const team = i.scope === "team" && user.role !== "member";
      const r = team ? await allMailboxUsage(db) : await inboxesForUser(db, user.id!);
      return {
        day: r.day, warn_above: r.cfg.warnAt, daily_max: r.cfg.perAddressMax, first_emails_from_company_domain: r.cfg.protectCore,
        inboxes: r.inboxes.map((x) => ({ address: x.email, writes_as: x.writesAs, company_domain: x.core, sent_today: x.sent, due_today: x.queued, max_today: x.max, left: x.left, state: x.state, warming_up: x.warming, paused: x.paused, paused_reason: x.pausedReason, default: x.isDefault })),
      };
    },
  },
  {
    name: "list_my_files",
    description: "The files the person has attached before: name, size and whether it is archived. Use read_attached_file to read one.",
    schema: z.object({ archived: z.boolean().optional() }),
    run: async ({ db, user }, i: { archived?: boolean }) => {
      const rows = await listFiles(db, user, { archived: i.archived });
      return { files: rows.map((f) => ({ file_id: f.id, name: f.name, chars: f.chars, pages: f.pages, uploaded: f.created_at.slice(0, 10), archived: !!f.archived_at })) };
    },
  },
  {
    name: "read_attached_file",
    description: "Reads text from one of the person's attached files, in pieces of up to 20,000 characters. Pass offset to continue.",
    schema: z.object({ file_id: z.string(), offset: z.number().optional() }),
    run: async ({ db, user }, i: { file_id: string; offset?: number }) => {
      const { data } = await db.from("agent_files").select("id, name, chars, content").eq("id", i.file_id).eq("user_id", user.id!).maybeSingle();
      if (!data) return { error: "No such file among the person's files." };
      const offset = Math.max(0, Math.floor(i.offset ?? 0));
      const text = (data.content as string).slice(offset, offset + 20_000);
      return { name: data.name, total_chars: data.chars, offset, next_offset: offset + text.length < (data.chars as number) ? offset + text.length : null, text };
    },
  },
  {
    name: "list_settings",
    description: "The settings you can read or propose changes to, with where each lives and whether this person may change it. Some need a mailbox or a persona.",
    schema: z.object({}),
    run: async (ctx) => {
      const list = await visibleSettings(ctx);
      const out = [];
      for (const d of list) out.push({ setting: d.id, label: d.label, who_can_change: d.area === "self" ? "the person themselves" : d.area === "mailbox" ? "admins and the people who run that mailbox" : d.area === "team" ? "admins and managers" : "admins", needs: d.needs ?? null, page: d.href, can_change_now: d.needs ? "depends on the mailbox or persona" : await d.can(ctx, {}) });
      return { settings: out, not_available_here: "The assistant's own limits, integrations and tool permissions, tokens, roles and backups can only be changed on the Settings pages." };
    },
  },
  {
    name: "get_setting",
    description: "The current value of one setting. Pass mailbox (an address like sid@spendflo.com) or persona when the setting needs one.",
    schema: z.object({ setting: z.string(), mailbox: z.string().optional(), persona: z.string().optional() }),
    run: async (ctx, i: { setting: string; mailbox?: string; persona?: string }) => {
      const d = settingById(i.setting);
      if (!d || !(await visibleSettings(ctx)).includes(d)) return { error: "Unknown setting. Use list_settings." };
      const p = { mailbox: i.mailbox, persona: i.persona };
      if (d.needs === "mailbox" && !p.mailbox) return { error: "Which mailbox? Pass its address." };
      if (d.needs === "persona" && !p.persona) return { error: "Which persona?" };
      return { setting: d.id, label: d.label, scope: (await d.scopeLabel?.(ctx, p)) ?? null, value: await d.read(ctx, p), can_change: await d.can(ctx, p), page: d.href };
    },
  },
  {
    name: "settings_health",
    description: "How each system is doing, as on the Settings Overview: Gmail, sheet sync, Slack, signals feed, LinkedIn emails, budgets, integrations. Use it to answer 'is X working' and 'why did X fail'.",
    schema: z.object({}),
    run: async ({ db, user }) => ({ systems: (await loadHealth(db, user)).map((t) => ({ system: t.label, state: t.tone, summary: t.value, detail: t.detail, fix_at: t.href })) }),
  },
  {
    name: "propose_setting",
    description: "Propose changing one setting. This does NOT change it: the person sees a card with before and after and approves it. Pass the full new value. Pass mailbox or persona when the setting needs one.",
    schema: z.object({ setting: z.string(), value: z.union([z.string(), z.number(), z.boolean()]), mailbox: z.string().optional(), persona: z.string().optional() }),
    run: async (ctx, i: { setting: string; value: string | number | boolean; mailbox?: string; persona?: string }) => {
      const d = settingById(i.setting);
      if (!d) return { error: "Unknown setting. Use list_settings." };
      const p = { mailbox: i.mailbox, persona: i.persona };
      if (d.needs === "mailbox" && !(await resolveMailbox(ctx.db, p.mailbox))) return { error: "Which mailbox? Pass its address, for example sid@spendflo.com." };
      if (d.needs === "persona" && !p.persona) return { error: "Which persona?" };
      const v = d.value.safeParse(i.value);
      if (!v.success) return { error: v.error.issues[0]?.message ?? "That value is not allowed." };
      if (!(await d.can(ctx, p))) return { error: `This person cannot change ${d.label}. ${d.area === "admin" ? "Only admins can." : d.area === "team" ? "Admins and managers can." : d.area === "mailbox" ? "Admins and the people who run that mailbox can." : ""}` };
      const before = await d.read(ctx, p);
      if (JSON.stringify(before) === JSON.stringify(v.data)) return { note: "It is already set to that. Nothing to change." };
      if (!ctx.run) return { error: "Proposals are only possible during a chat." };
      const summary = summarizeChange(d.label, (await d.scopeLabel?.(ctx, p)) ?? null, before, v.data);
      const a = await proposeSettingAction(ctx.db, { runId: ctx.run.runId, threadId: ctx.run.threadId, userId: ctx.user.id!, settingId: d.id, params: p, value: v.data, summary });
      ctx.run.onAction({ id: a.id, title: a.title, summary, settingId: d.id, input: { setting: d.id, ...p } });
      return { proposed: true, status: "Waiting for the person to approve the card. Nothing has changed yet.", change: summary };
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
