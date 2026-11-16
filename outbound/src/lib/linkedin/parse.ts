/**
 * LinkedIn notification emails (pure). Only three shapes matter:
 *  - "X accepted your invitation"          from invitations@linkedin.com
 *  - "X sent you a message"                from messages-noreply@linkedin.com
 *  - "Message replied from X" (InMail)     from hit-reply@linkedin.com
 * Everything else LinkedIn sends (posts, digests, Sales Navigator) is ignored.
 */

export type LinkedInNotice =
  | { kind: "accepted"; name: string; headline: string | null }
  | { kind: "message"; name: string; text: string };

export const LINKEDIN_SENDERS = ["invitations@linkedin.com", "messages-noreply@linkedin.com", "hit-reply@linkedin.com"] as const;
export const LINKEDIN_QUERY = `from:(${LINKEDIN_SENDERS.join(" OR ")})`;

const NOISE = /commented|mentioned you|reacted|your post|your comment|new leads|new accounts|signals from|shared a post|weekly|impressions|waiting for your response|i want to connect|newsletter/i;

/** The name LinkedIn puts in the sender field: "Ricky Wallis via LinkedIn" or "Mark M." */
export function senderName(display: string): string {
  return display.replace(/\s+via LinkedIn\s*$/i, "").replace(/\s+/g, " ").trim();
}

const ADDRESS = /<?([^<>\s]+@[^<>\s]+)>?\s*$/;
export function parseLinkedIn(input: { fromAddress: string; fromDisplay: string; subject: string; text: string }): LinkedInNotice | null {
  const addr = (input.fromAddress.match(ADDRESS)?.[1] ?? input.fromAddress).toLowerCase();
  const subject = input.subject.trim();
  if (addr === "invitations@linkedin.com") {
    if (!/accepted your invitation/i.test(subject)) return null;
    const name = senderName(input.fromDisplay);
    if (!name) return null;
    return { kind: "accepted", name, headline: headlineFrom(input.text, name) };
  }
  if (NOISE.test(subject)) return null;
  if (addr === "messages-noreply@linkedin.com") {
    const m = subject.match(/^(.+?) sent you (?:a|\d+) messages?/i);
    if (!m) return null;
    return { kind: "message", name: m[1].trim(), text: cleanMessage(input.text) };
  }
  if (addr === "hit-reply@linkedin.com") {
    const m = subject.match(/^Message replied from (.+)$/i);
    const name = (m?.[1] ?? senderName(input.fromDisplay)).trim();
    if (!name) return null;
    return { kind: "message", name, text: cleanMessage(input.text) };
  }
  return null;
}

/** "Ricky Wallis" then the next non-empty line is the headline ("Contracts Manager at SSE plc"). */
export function headlineFrom(text: string, name: string): string | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const i = lines.findIndex((l) => l.toLowerCase() === name.toLowerCase());
  const next = i >= 0 ? lines[i + 1] : undefined;
  return next && !/^(message|connect|suggestions)/i.test(next) ? next : null;
}

/** The visible text of an email: no style blocks, tags or LinkedIn's invisible padding. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|tr|td|h\d|li|table)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|’/g, "'").replace(/&quot;/g, '"')
    .replace(/[͏​-‏⁠﻿]/g, "")
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}

function cleanMessage(text: string): string {
  const cut = text.split(/View in Sales Navigator|View message|Reply to |----------------/i)[0];
  return cut.replace(/^You have a new InMail message\.?/i, "").trim().slice(0, 4000);
}

// ---------------------------------------------------------------------------
// Matching a notice to a contact in a live campaign
// ---------------------------------------------------------------------------

export type Candidate = { id: string; accountId: string; accountName: string; fullName: string; title: string | null };
export type Match = { kind: "match"; candidate: Candidate } | { kind: "ambiguous"; candidates: Candidate[] } | { kind: "none" };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const PREFIX = /^(dr|mr|mrs|ms|prof)\s+/;
/** Contact names in the sheet often carry credentials ("Tyler Richardson MBA", "Jo Smith, CPA"). */
const CREDENTIALS = /\b(mba|cpa|pmp|phd|cpm|cscp|cips|fcips|acma|aca|cfa|esq|jd|cpsm|cltd|sphr|shrm|cp|mph|msc|bsc|ma|ms)$/;
const clean = (full: string) => { let n = norm(full.replace(/,.*$/, "")); while (CREDENTIALS.test(n) && n.split(" ").length > 2) n = n.replace(/\s+\S+$/, ""); return n; };
const first = (n: string) => n.replace(PREFIX, "").split(" ")[0] ?? "";
const last = (n: string) => { const p = n.replace(PREFIX, "").split(" "); return p.length > 1 ? p[p.length - 1] : ""; };

/** Strict on the name, then the company in the headline separates two people who share it. Never guesses between two. */
export function matchContact(name: string, headline: string | null, candidates: readonly Candidate[]): Match {
  const n = clean(name);
  if (!n) return { kind: "none" };
  const nf = first(n), nl = last(n);
  // "Mark M." only gives an initial: first name plus the initial of the last name.
  const initialOnly = nl.length === 1;
  const byName = candidates.filter((c) => {
    const cn = clean(c.fullName);
    if (cn === n) return true;
    if (first(cn) !== nf) return false;
    return initialOnly ? last(cn).startsWith(nl) : last(cn) === nl && nl.length > 0;
  });
  if (byName.length <= 1) return byName.length ? { kind: "match", candidate: byName[0] } : { kind: "none" };
  const h = norm(headline ?? "");
  if (h) {
    const byCompany = byName.filter((c) => { const a = norm(c.accountName); return a.length >= 3 && h.includes(a); });
    if (byCompany.length === 1) return { kind: "match", candidate: byCompany[0] };
  }
  return { kind: "ambiguous", candidates: byName };
}
