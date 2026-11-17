import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionError } from "@/lib/campaigns/actions";
import type { SessionUser } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";
import { inboxesForUser, type Inbox } from "./usage";
import { sendState, type SendState, type SendingConfig } from "./rules";

/**
 * The checks every email goes through before a draft is created. One place, so the Tasks panel,
 * the account page and the assistant cannot send around the rules.
 */

export type StepFacts = { id: string; contactId: string; assigneeId: string; sendFromMailboxId: string | null; gmailThreadId: string | null };

export type Option = { key: string; mailboxId: string | null; email: string; left: number; label: string };

export type SendingNotice = {
  email: string;
  sent: number;
  max: number;
  warn: number;
  /** The state if this send goes out. */
  state: SendState;
  line: string;
  /** Set when the address is a core domain and this is a cold first touch (rule is on "warn"). */
  coreWarning?: string;
};

/** Cold first touch: no email to this person has been sent from the app and they have never replied. A draft alone does not count. */
export async function isFirstTouch(db: SupabaseClient, s: StepFacts): Promise<boolean> {
  const [{ count: sent }, { count: replies }] = await Promise.all([
    db.from("steps").select("id", { count: "exact", head: true }).eq("contact_id", s.contactId).eq("channel", "email").eq("status", "done").neq("id", s.id),
    db.from("responses").select("id", { count: "exact", head: true }).eq("contact_id", s.contactId),
  ]);
  return (sent ?? 0) === 0 && (replies ?? 0) === 0;
}

/** Which inbox this step goes from: a chosen one, the one used earlier for this person, else the person's default. */
export function pickInbox(inboxes: Inbox[], s: StepFacts, chosenMailboxId: string | null | undefined, lastSentFrom: string | null): Inbox {
  const byMailbox = (id: string | null | undefined) => (id ? inboxes.find((i) => i.mailboxId === id) : undefined);
  return byMailbox(chosenMailboxId) ?? byMailbox(s.sendFromMailboxId) ?? (lastSentFrom ? inboxes.find((i) => i.email.toLowerCase() === lastSentFrom.toLowerCase()) : undefined) ?? inboxes.find((i) => i.isDefault) ?? inboxes[0];
}

function options(inboxes: Inbox[], exceptKey: string, avoidCore: boolean): Option[] {
  return inboxes
    .filter((i) => i.key !== exceptKey && !i.paused && i.connected && i.left > 0 && !(avoidCore && i.core))
    .sort((a, b) => b.left - a.left)
    .map((i) => ({ key: i.key, mailboxId: i.mailboxId, email: i.email, left: i.left, label: i.writesAs ? `${i.email} (as ${i.writesAs})` : i.email }));
}

/** Is a cold email from a core domain blocked right now? Only when an outreach inbox exists to send from instead. */
export async function outreachInboxExists(db: SupabaseClient, core: (email: string) => boolean): Promise<boolean> {
  const { data } = await db.from("mailboxes").select("email, google_token_status, paused_at");
  return (data ?? []).some((m) => m.google_token_status === "ok" && !m.paused_at && !core(m.email as string));
}

function noticeLine(i: Inbox, state: SendState): string {
  if (state === "ok") return `Email ${i.sent + 1} of ${i.max} from ${i.email} today.`;
  if (state === "warn") return `This will be email ${i.sent + 1} from ${i.email} today. More than ${i.warn} a day from one address puts the domain at risk (limit ${i.max}).`;
  return `${i.email} is over its limit of ${i.max} today. An admin let this one through.`;
}

export type Verdict = {
  inbox: Inbox;
  cfg: SendingConfig;
  firstTouch: boolean;
  state: SendState;
  /** Why this send cannot go as it is. Null when it can (maybe with a warning). */
  block: { code: "paused" | "cap" | "core"; message: string } | null;
  coreWarning: string | null;
  options: Option[];
  canOverride: boolean;
  notice: SendingNotice;
};

/** Looks at one email about to go out and says whether it can, with a warning, or not. Changes nothing. */
export async function evaluateSend(
  db: SupabaseClient,
  user: SessionUser,
  step: StepFacts,
  opts: { mailboxId?: string | null; lastSentFrom?: string | null },
): Promise<Verdict> {
  const { inboxes, cfg } = await inboxesForUser(db, step.assigneeId);
  if (opts.mailboxId && !inboxes.some((i) => i.mailboxId === opts.mailboxId)) throw new ActionError("You are not set up to send from that inbox", 403);
  const inbox = pickInbox(inboxes, step, opts.mailboxId, opts.lastSentFrom ?? null);
  const firstTouch = await isFirstTouch(db, step);
  const coreOf = (e: string) => inboxes.some((i) => i.email.toLowerCase() === e.toLowerCase() && i.core);
  const canOverride = user.role === "admin" || user.role === "manager";
  const state = sendState(inbox.sent, inbox.warn, inbox.max);
  const coreHit = firstTouch && inbox.core && cfg.protectCore !== "off" && (await outreachInboxExists(db, coreOf));

  let block: Verdict["block"] = null;
  if (inbox.paused) block = { code: "paused", message: `${inbox.email} is paused${inbox.pausedReason ? `: ${inbox.pausedReason}` : ""}. Pick another inbox.` };
  else if (state === "full") block = { code: "cap", message: `${inbox.email} has sent ${inbox.sent} of ${inbox.max} today. That is the daily limit.` };
  else if (coreHit && cfg.protectCore === "block") block = { code: "core", message: `First emails to new people should not come from ${inbox.email}, your company domain. Send from an outreach inbox instead.` };
  const coreWarning = coreHit && cfg.protectCore === "warn" ? `First emails to new people are safer from an outreach inbox than from ${inbox.email}, your company domain.` : null;

  return {
    inbox, cfg, firstTouch, state, block, coreWarning, canOverride,
    options: options(inboxes, inbox.key, firstTouch && cfg.protectCore !== "off"),
    notice: { email: inbox.email, sent: inbox.sent, max: inbox.max, warn: inbox.warn, state, line: noticeLine(inbox, state), coreWarning: coreWarning ?? undefined },
  };
}

/** The same look, enforced: used right before a Gmail draft is created. */
export async function checkBeforeDraft(
  db: SupabaseClient,
  user: SessionUser,
  step: StepFacts,
  opts: { mailboxId?: string | null; override?: boolean; lastSentFrom?: string | null },
): Promise<{ inbox: Inbox; notice: SendingNotice; firstTouch: boolean; cfg: SendingConfig }> {
  const v = await evaluateSend(db, user, step, opts);
  if (v.block) {
    // Pausing is never overridden. A limit or the core rule can be, by an admin or manager who says so.
    if (v.block.code === "paused" || !(opts.override && v.canOverride)) {
      throw new ActionError(v.block.message, 409, { code: v.block.code, sending: { email: v.inbox.email, sent: v.inbox.sent, max: v.inbox.max }, options: v.options, canOverride: v.canOverride && v.block.code !== "paused" });
    }
    await logActivity(db, { entityType: "step", entityId: step.id, action: "sending_limit_overridden", actorId: user.id, after: { email: v.inbox.email, sent: v.inbox.sent, max: v.inbox.max, rule: v.block.code } });
  }
  return { inbox: v.inbox, notice: v.notice, firstTouch: v.firstTouch, cfg: v.cfg };
}
