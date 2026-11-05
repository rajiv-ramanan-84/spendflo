import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleAuthError, getMessage, getThread, gmailAccessToken, listMessageIds } from "@/lib/google/gmail";
import { markDone } from "@/lib/steps/execute";
import type { SessionUser } from "@/lib/auth/session";
import { addressOf, bodyText, bouncedAddress, header, isBounce, matchSender, stripQuoted } from "./parse";
import { recordDetected } from "./service";

/**
 * Gmail check (PRD section 11), every 15 minutes during working hours.
 * Per teammate with a working token:
 *  1. Steps whose draft was sent: mark done with the text actually sent.
 *  2. New inbound mail from known contacts or account domains, plus bounces:
 *     saved once per Gmail message as a pending confirm card.
 * Nothing is sent and nothing changes a plan until a person confirms.
 */

const OPEN = ["upcoming", "due", "overdue"];

export async function runGmailCheck(db: SupabaseClient, opts: { lookbackDays?: number } = {}) {
  const lookback = opts.lookbackDays ?? 2;
  const { data: users, error } = await db.from("users").select("id, auth_user_id, email, name, role, avatar_url, google_token_status").eq("active", true);
  if (error) throw new Error(`Gmail check could not read the team: ${error.message}`);
  const { data: contacts } = await db.from("contacts").select("id, email, account_id").not("email", "is", null).is("deleted_at", null);
  const { data: accounts } = await db.from("accounts").select("id, domain").is("deleted_at", null);
  const report: Array<{ user: string; sent: number; replies: number; skipped?: string }> = [];

  for (const u of users ?? []) {
    let token: string;
    try {
      token = await gmailAccessToken(db, u.id);
    } catch (e) {
      report.push({ user: u.email, sent: 0, replies: 0, skipped: e instanceof GoogleAuthError ? "token" : "error" });
      continue;
    }
    const actor: SessionUser = { authUserId: u.auth_user_id, id: u.id, email: u.email, name: u.name, role: u.role, avatarUrl: u.avatar_url };
    const sent = await checkSentDrafts(db, token, actor);
    const replies = await checkInbound(db, token, u.email, contacts ?? [], accounts ?? [], lookback);
    report.push({ user: u.email, sent, replies });
  }
  return { checked: report.length, report };
}

async function checkSentDrafts(db: SupabaseClient, token: string, actor: SessionUser) {
  const { data: steps } = await db.from("steps").select("id, gmail_thread_id, gmail_message_id").eq("assignee_id", actor.id).eq("channel", "email").in("status", OPEN).not("gmail_thread_id", "is", null).is("deleted_at", null);
  let n = 0;
  for (const s of steps ?? []) {
    const thread = await getThread(token, s.gmail_thread_id!);
    const sentMsg = thread?.messages.find((m) => m.labelIds?.includes("SENT") && !m.labelIds?.includes("DRAFT"));
    if (!sentMsg) continue;
    await markDone(db, actor, s.id, { sentBody: stripQuoted(bodyText(sentMsg.payload)) || null, note: "Sent from Gmail (detected)" });
    await db.from("steps").update({ gmail_message_id: sentMsg.id }).eq("id", s.id);
    n++;
  }
  return n;
}

async function checkInbound(
  db: SupabaseClient,
  token: string,
  ownEmail: string,
  contacts: Array<{ id: string; email: string | null; account_id: string }>,
  accounts: Array<{ id: string; domain: string | null }>,
  lookback: number,
) {
  const ids = await listMessageIds(token, `in:inbox newer_than:${lookback}d -from:${ownEmail}`, 100);
  if (!ids.length) return 0;
  const { data: seen } = await db.from("responses").select("gmail_message_id").in("gmail_message_id", ids);
  const known = new Set((seen ?? []).map((r) => r.gmail_message_id));
  let n = 0;
  for (const id of ids.filter((x) => !known.has(x))) {
    const m = await getMessage(token, id);
    if (!m) continue;
    const from = header(m.payload, "From");
    const subject = header(m.payload, "Subject");
    const receivedAt = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString();
    const text = stripQuoted(bodyText(m.payload));

    if (isBounce(from, subject, m.payload)) {
      const addr = bouncedAddress(bodyText(m.payload), contacts.map((c) => c.email!).filter(Boolean));
      const c = addr ? contacts.find((x) => x.email?.toLowerCase() === addr.toLowerCase()) : null;
      if (!c) continue;
      const r = await recordDetected(db, { gmailMessageId: id, fromAddress: addr!, receivedAt, text: text.slice(0, 2000), threadContext: null, accountId: c.account_id, contactId: c.id, bounce: true });
      if (r.created) n++;
      continue;
    }

    const match = matchSender(addressOf(from), contacts, accounts);
    if (match.kind === "none") continue;
    const { data: step } = await db.from("steps").select("subject, sent_body, body").eq("gmail_thread_id", m.threadId).order("sequence_no", { ascending: false }).limit(1).maybeSingle();
    const r = await recordDetected(db, {
      gmailMessageId: id,
      fromAddress: addressOf(from),
      receivedAt,
      text,
      threadContext: step ? `Subject: ${step.subject ?? subject}\n\n${step.sent_body ?? step.body ?? ""}` : null,
      accountId: match.accountId,
      contactId: match.kind === "contact" ? match.contactId : null,
    });
    if (r.created) n++;
  }
  return n;
}
