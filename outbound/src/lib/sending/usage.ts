import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIn } from "@/lib/calendar/dates";
import { loadSendingConfig } from "./config";
import { coreDomainSet, dayState, domainOf, effectiveMax, effectiveWarn, isCoreAddress, left, type SendState, type SendingConfig } from "./rules";

/**
 * Who can send from where, and how much of today each address has used.
 * An "inbox" is an address mail can go out from: a person's own Gmail, or a connected mailbox.
 */

export type Inbox = {
  key: string;
  mailboxId: string | null;
  email: string;
  /** Whose name it writes as, for a connected mailbox. */
  writesAs: string | null;
  core: boolean;
  /** A connected mailbox: Gmail's own sent count is included, so mail sent outside the app counts too. */
  dedicated: boolean;
  connected: boolean;
  paused: boolean;
  pausedReason: string | null;
  warming: boolean;
  warmingDaysLeft: number | null;
  sent: number;
  queued: number;
  max: number;
  warn: number;
  left: number;
  state: SendState;
  isDefault: boolean;
};

type MailboxRow = { id: string; email: string; writes_as_user_id: string; google_token_status: string; established: boolean; created_at: string; connected_at: string | null; warmup_started_at: string | null; paused_at: string | null; paused_reason: string | null };

const MB_COLS = "id, email, writes_as_user_id, google_token_status, established, created_at, connected_at, warmup_started_at, paused_at, paused_reason";

/** Mailboxes a person may send from: the one they are set to, ones they run, and ones they connected. */
export async function usableMailboxIds(db: SupabaseClient, userId: string): Promise<string[]> {
  const [{ data: me }, { data: ops }, { data: mine }] = await Promise.all([
    db.from("users").select("send_mailbox_id").eq("id", userId).single(),
    db.from("mailbox_operators").select("mailbox_id").eq("user_id", userId),
    db.from("mailboxes").select("id").eq("connected_by", userId),
  ]);
  return [...new Set([me?.send_mailbox_id, ...(ops ?? []).map((o) => o.mailbox_id), ...(mine ?? []).map((m) => m.id)].filter(Boolean) as string[])];
}

export async function sentTodayByAddress(db: SupabaseClient, emails: string[], day: string, dedicated: Set<string>): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!emails.length) return out;
  const [{ data: log }, { data: gm }] = await Promise.all([
    db.from("send_log").select("from_email").eq("sent_day", day).in("from_email", emails),
    db.from("gmail_sent_counts").select("email, sent").eq("day", day).in("email", emails),
  ]);
  const app = new Map<string, number>();
  for (const r of log ?? []) app.set(String(r.from_email).toLowerCase(), (app.get(String(r.from_email).toLowerCase()) ?? 0) + 1);
  const gmail = new Map((gm ?? []).map((r) => [String(r.email).toLowerCase(), Number(r.sent)]));
  for (const e of emails) {
    const k = e.toLowerCase();
    out.set(k, dedicated.has(k) ? Math.max(app.get(k) ?? 0, gmail.get(k) ?? 0) : app.get(k) ?? 0);
  }
  return out;
}

async function coreSet(db: SupabaseClient, cfg: SendingConfig) {
  const { data } = await db.from("users").select("email").eq("active", true);
  return coreDomainSet(cfg, (data ?? []).map((u) => u.email as string));
}

function build(args: { cfg: SendingConfig; core: Set<string>; now: Date; mb: MailboxRow | null; email: string; writesAs: string | null; sent: number; queued: number; isDefault: boolean }): Inbox {
  const { cfg, core, now, mb } = args;
  const eff = effectiveMax(cfg, mb ? { established: mb.established, startedAt: mb.warmup_started_at ?? mb.connected_at ?? mb.created_at } : null, now);
  const warn = effectiveWarn(cfg, eff.max);
  return {
    key: mb?.id ?? "own",
    mailboxId: mb?.id ?? null,
    email: args.email,
    writesAs: args.writesAs,
    core: isCoreAddress(args.email, core),
    dedicated: !!mb,
    connected: mb ? mb.google_token_status === "ok" : true,
    paused: !!mb?.paused_at,
    pausedReason: mb?.paused_reason ?? null,
    warming: eff.warming,
    warmingDaysLeft: eff.fullAt,
    sent: args.sent,
    queued: args.queued,
    max: eff.max,
    warn,
    left: left(args.sent, eff.max),
    state: dayState(args.sent, warn, eff.max),
    isDefault: args.isDefault,
  };
}

/** The inboxes one person can send from, with today's use and what is still queued for today. */
export async function inboxesForUser(db: SupabaseClient, userId: string, now: Date = new Date()): Promise<{ inboxes: Inbox[]; cfg: SendingConfig; day: string }> {
  const cfg = await loadSendingConfig(db);
  const day = todayIn("Asia/Kolkata", now);
  const [{ data: me }, ids, core] = await Promise.all([
    db.from("users").select("email, name, send_mailbox_id").eq("id", userId).single(),
    usableMailboxIds(db, userId),
    coreSet(db, cfg),
  ]);
  const { data: mbs } = ids.length ? await db.from("mailboxes").select(MB_COLS).in("id", ids) : { data: [] as MailboxRow[] };
  const mailboxes = (mbs ?? []) as MailboxRow[];
  const { data: personas } = mailboxes.length ? await db.from("users").select("id, name").in("id", mailboxes.map((m) => m.writes_as_user_id)) : { data: [] as Array<{ id: string; name: string }> };
  const persona = new Map((personas ?? []).map((p) => [p.id, p.name]));
  const addrs = [me!.email as string, ...mailboxes.map((m) => m.email)];
  const sent = await sentTodayByAddress(db, addrs, day, new Set(mailboxes.map((m) => m.email.toLowerCase())));

  const defaultKey = (me?.send_mailbox_id as string | null) ?? "own";
  const { data: due } = await db.from("steps").select("send_from_mailbox_id").eq("assignee_id", userId).eq("channel", "email").in("status", ["upcoming", "due", "overdue"]).lte("due_date", day).is("deleted_at", null);
  const queuedBy = new Map<string, number>();
  for (const s of due ?? []) {
    const k = (s.send_from_mailbox_id as string | null) ?? defaultKey;
    queuedBy.set(k, (queuedBy.get(k) ?? 0) + 1);
  }

  const own = build({ cfg, core, now, mb: null, email: me!.email as string, writesAs: null, sent: sent.get((me!.email as string).toLowerCase()) ?? 0, queued: queuedBy.get("own") ?? 0, isDefault: defaultKey === "own" });
  const shared = mailboxes.map((m) => build({ cfg, core, now, mb: m, email: m.email, writesAs: persona.get(m.writes_as_user_id) ?? null, sent: sent.get(m.email.toLowerCase()) ?? 0, queued: queuedBy.get(m.id) ?? 0, isDefault: defaultKey === m.id }));
  return { inboxes: [own, ...shared], cfg, day };
}

/** Every connected mailbox, for the admin view. */
export async function allMailboxUsage(db: SupabaseClient, now: Date = new Date()): Promise<{ inboxes: Inbox[]; cfg: SendingConfig; day: string }> {
  const cfg = await loadSendingConfig(db);
  const day = todayIn("Asia/Kolkata", now);
  const [{ data: mbs }, core, { data: users }] = await Promise.all([db.from("mailboxes").select(MB_COLS).order("email"), coreSet(db, cfg), db.from("users").select("id, name")]);
  const mailboxes = (mbs ?? []) as MailboxRow[];
  const name = new Map((users ?? []).map((u) => [u.id as string, u.name as string]));
  const sent = await sentTodayByAddress(db, mailboxes.map((m) => m.email), day, new Set(mailboxes.map((m) => m.email.toLowerCase())));
  return {
    cfg, day,
    inboxes: mailboxes.map((m) => build({ cfg, core, now, mb: m, email: m.email, writesAs: name.get(m.writes_as_user_id) ?? null, sent: sent.get(m.email.toLowerCase()) ?? 0, queued: 0, isDefault: false })),
  };
}

export { domainOf };
