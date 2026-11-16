import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMessage, listMessageIds } from "@/lib/google/gmail";
import { bodyText, header } from "@/lib/responses/parse";
import { effectOf, needsReview } from "@/lib/responses/rules";
import { recordDetected, requestReplan } from "@/lib/responses/service";
import { markDone, pullForward } from "@/lib/steps/execute";
import { logActivity } from "@/lib/activity/log";
import { postAccountNote } from "@/lib/slack/posts";
import type { SessionUser } from "@/lib/auth/session";
import type { Classification } from "@/lib/claude/schemas";
import { LINKEDIN_QUERY, htmlToText, matchContact, parseLinkedIn, type Candidate } from "./parse";

/**
 * LinkedIn notification emails, read by the same mail scan as replies (every 15 minutes).
 * Only mail from LinkedIn's own notification addresses is opened. Only people who are in a
 * live campaign are acted on; everyone else is logged as unmatched and left alone.
 *  - Accepted: facts, so the app applies them (connect done, contact connected, message step pulled forward).
 *  - Message or InMail reply: saved as a reply card like an email reply; if it changes the plan,
 *    the re-plan is prepared and waits for approval.
 */

const LIVE = ["active", "paused", "responded", "meeting_booked"];

type Part = Parameters<typeof header>[0];
const htmlOf = (p: Part & { parts?: Part[]; body?: { data?: string } }): string => {
  const find = (x: (Part & { parts?: Part[]; body?: { data?: string } }) | undefined): string => {
    if (!x) return "";
    if (x.mimeType === "text/html" && x.body?.data) return Buffer.from(x.body.data, "base64url").toString("utf8");
    for (const c of x.parts ?? []) { const r = find(c); if (r) return r; }
    return "";
  };
  return find(p);
};

async function candidates(db: SupabaseClient): Promise<Candidate[]> {
  const { data: camps } = await db.from("campaigns").select("id, account_id").is("deleted_at", null).in("status", LIVE);
  const accountIds = [...new Set((camps ?? []).map((c) => c.account_id as string))];
  if (!accountIds.length) return [];
  const [{ data: accts }, { data: people }] = await Promise.all([
    db.from("accounts").select("id, name").in("id", accountIds),
    db.from("contacts").select("id, account_id, full_name, title").in("account_id", accountIds).is("deleted_at", null),
  ]);
  const name = new Map((accts ?? []).map((a) => [a.id as string, a.name as string]));
  return (people ?? []).map((c) => ({ id: c.id, accountId: c.account_id, accountName: name.get(c.account_id) ?? "", fullName: c.full_name, title: c.title }));
}

async function actorFor(db: SupabaseClient, userId: string | null): Promise<SessionUser | null> {
  if (!userId) return null;
  const { data: u } = await db.from("users").select("id, auth_user_id, email, name, role, avatar_url").eq("id", userId).maybeSingle();
  return u ? { authUserId: u.auth_user_id, id: u.id, email: u.email, name: u.name, role: u.role, avatarUrl: u.avatar_url } : null;
}

export async function scanLinkedIn(db: SupabaseClient, token: string, inbox: string, lookbackDays: number) {
  const ids = await listMessageIds(token, `in:inbox newer_than:${lookbackDays}d ${LINKEDIN_QUERY}`, 100);
  if (!ids.length) return { accepted: 0, messages: 0, unmatched: 0 };
  const [{ data: a }, { data: b }] = await Promise.all([
    db.from("linkedin_events").select("gmail_message_id").in("gmail_message_id", ids),
    db.from("responses").select("gmail_message_id").in("gmail_message_id", ids),
  ]);
  const known = new Set([...(a ?? []), ...(b ?? [])].map((r) => r.gmail_message_id as string));
  const fresh = ids.filter((id) => !known.has(id));
  const out = { accepted: 0, messages: 0, unmatched: 0 };
  if (!fresh.length) return out;
  const list = await candidates(db);

  for (const id of fresh) {
    const m = await getMessage(token, id);
    if (!m) continue;
    const fromRaw = header(m.payload, "From");
    const display = fromRaw.replace(/\s*<[^>]*>\s*$/, "").replace(/^"|"$/g, "");
    const addr = fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw;
    const html = htmlOf(m.payload as never);
    const plain = bodyText(m.payload);
    const viaHtml = html ? htmlToText(html) : "";
    // An acceptance only names the person in the HTML; a message's own words are in the plain text.
    const text = /invitations@/i.test(addr) ? viaHtml || plain : plain || viaHtml;
    const notice = parseLinkedIn({ fromAddress: addr, fromDisplay: display, subject: header(m.payload, "Subject"), text });
    if (!notice) continue; // ignored mail is never stored
    const receivedAt = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString();
    const headline = notice.kind === "accepted" ? notice.headline : null;
    const match = matchContact(notice.name, headline, list);
    const base = { gmail_message_id: id, kind: notice.kind, person_name: notice.name, headline, inbox, received_at: receivedAt };

    if (match.kind !== "match") {
      const { error } = await db.from("linkedin_events").insert({ ...base, status: match.kind === "ambiguous" ? "ambiguous" : "unmatched", detail: match.kind === "ambiguous" ? `Could be ${match.candidates.map((c) => `${c.fullName} (${c.accountName})`).join(" or ")}` : null });
      if (!error) out.unmatched++;
      continue;
    }
    const c = match.candidate;
    if (notice.kind === "accepted") {
      const detail = await applyAccepted(db, c, receivedAt);
      const { error } = await db.from("linkedin_events").insert({ ...base, status: "applied", account_id: c.accountId, contact_id: c.id, detail });
      if (!error) out.accepted++;
    } else {
      const r = await recordDetected(db, { gmailMessageId: id, fromAddress: `${c.fullName} (LinkedIn)`, receivedAt, text: notice.text || `${notice.name} sent a LinkedIn message. Open LinkedIn to read it.`, threadContext: null, accountId: c.accountId, contactId: c.id, channel: "linkedin_message" });
      const { error } = await db.from("linkedin_events").insert({ ...base, status: "recorded", account_id: c.accountId, contact_id: c.id, detail: r.created ? "Saved as a reply card" : "Already recorded" });
      if (!error && r.created) {
        out.messages++;
        if (r.id) await prepareReplan(db, r.id);
      }
    }
  }
  return out;
}

/** A connection accepted: mark the connect done, the contact connected, and bring the LinkedIn message forward. */
export async function applyAccepted(db: SupabaseClient, c: Candidate, at: string): Promise<string> {
  const { data: campaign } = await db.from("campaigns").select("id, owner_id").eq("account_id", c.accountId).is("deleted_at", null).in("status", LIVE).maybeSingle();
  const { data: contact } = await db.from("contacts").select("engagement_status").eq("id", c.id).single();
  if (contact && ["not_contacted", "contacted"].includes(contact.engagement_status as string)) await db.from("contacts").update({ engagement_status: "connected" }).eq("id", c.id);
  const notes: string[] = ["Connected on LinkedIn"];
  if (campaign) {
    const { data: steps } = await db.from("steps").select("id, channel, status, due_date, assignee_id").eq("campaign_id", campaign.id).eq("contact_id", c.id).in("channel", ["linkedin_connect", "linkedin_message"]).is("deleted_at", null).order("sequence_no");
    const open = (s: { status: string }) => ["upcoming", "due", "overdue"].includes(s.status);
    const connect = (steps ?? []).find((s) => s.channel === "linkedin_connect" && open(s));
    if (connect) {
      const actor = await actorFor(db, (connect.assignee_id as string | null) ?? (campaign.owner_id as string | null));
      if (actor) { await markDone(db, actor, connect.id, { note: "Connection accepted (seen in LinkedIn email)" }); notes.push("connect step marked done"); }
    }
    const msg = (steps ?? []).find((s) => s.channel === "linkedin_message" && open(s));
    if (msg) {
      const actor = await actorFor(db, (msg.assignee_id as string | null) ?? (campaign.owner_id as string | null));
      try {
        if (actor) { const r = await pullForward(db, actor, msg.id); notes.push(`LinkedIn message moved to ${r.date}`); }
      } catch (e) {
        notes.push(`LinkedIn message left on ${msg.due_date} (${e instanceof Error ? e.message : "could not move"})`);
      }
    }
    if (campaign.owner_id) await db.from("notifications").insert({ user_id: campaign.owner_id, type: "linkedin_accepted", entity_type: "account", entity_id: c.accountId, message: `${c.accountName}: ${c.fullName} accepted your LinkedIn invite` });
    await logActivity(db, { entityType: "contact", entityId: c.id, action: "linkedin_accepted", actorId: null, after: { notes, at } });
    await postAccountNote(db, c.accountId, `li-accepted-${c.id}`, `${c.fullName} accepted the LinkedIn invite. ${notes.slice(1).join(", ")}.`.replace(/\.\.$/, "."));
  }
  return notes.join("; ");
}

/** Gets the re-plan ready so a reply is one click to approve. Never throws: the card works without it. */
export async function prepareReplan(db: SupabaseClient, responseId: string) {
  try {
    const { data: r } = await db.from("responses").select("id, campaign_id, classification, confidence").eq("id", responseId).single();
    if (!r?.campaign_id || !r.classification || needsReview(r.confidence as number | null)) return;
    if (!effectOf(r.classification as Classification).needsReplan) return;
    const { data: c } = await db.from("campaigns").select("owner_id").eq("id", r.campaign_id).single();
    const actor = await actorFor(db, (c?.owner_id as string | null) ?? null);
    if (!actor) return;
    await requestReplan(db, actor, { campaignId: r.campaign_id as string, responseId, ownerNextStep: null, scope: "track" });
  } catch (e) {
    console.error("LinkedIn re-plan was not prepared:", e instanceof Error ? e.message : e);
  }
}
