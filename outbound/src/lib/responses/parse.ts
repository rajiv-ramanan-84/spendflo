/**
 * Reading Gmail messages without trusting them. Pure.
 * Only the new text of a reply reaches Claude, fenced as data.
 */

export type MessagePart = { mimeType?: string; body?: { data?: string }; parts?: MessagePart[]; headers?: Array<{ name: string; value: string }> };

export function header(p: MessagePart | undefined, name: string): string {
  return p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** "Patrick V <patrick@x.com>" -> "patrick@x.com" */
export function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

function decode(data?: string): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/** Plain text of a message: text/plain when present, else text/html stripped. */
export function bodyText(p: MessagePart | undefined): string {
  if (!p) return "";
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (x: MessagePart) => {
    if (x.mimeType === "text/plain" && x.body?.data) plain.push(decode(x.body.data));
    else if (x.mimeType === "text/html" && x.body?.data) html.push(decode(x.body.data));
    x.parts?.forEach(walk);
  };
  walk(p);
  return (plain.length ? plain.join("\n") : htmlToText(html.join("\n"))).replace(/\r\n/g, "\n");
}

/** The new part of a reply: drops quoted history and common signatures' quote markers. */
export function stripQuoted(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .{4,200} wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From: .+/.test(line.trim()) && out.length > 0) break;
    if (/^_{8,}$/.test(line.trim())) break;
    if (line.trim().startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function isBounce(from: string, subject: string, p: MessagePart | undefined): boolean {
  const f = from.toLowerCase();
  if (/mailer-daemon|postmaster|mail delivery (subsystem|system)/.test(f)) return true;
  if (/^(delivery status notification|undeliverable|mail delivery failed|returned mail)/i.test(subject.trim())) return true;
  let report = false;
  const walk = (x: MessagePart) => {
    if (x.mimeType === "message/delivery-status" || x.mimeType === "multipart/report") report = true;
    x.parts?.forEach(walk);
  };
  if (p) walk(p);
  return report;
}

/** Bounced address, read from the notice text. */
export function bouncedAddress(text: string, candidates: string[]): string | null {
  const lower = text.toLowerCase();
  return candidates.find((c) => lower.includes(c.toLowerCase())) ?? null;
}

export type MatchResult =
  | { kind: "contact"; contactId: string; accountId: string }
  | { kind: "account_domain"; accountId: string }
  | { kind: "none" };

/** Known contact by exact address, else a new person at a known account domain (PRD section 11). */
export function matchSender(
  address: string,
  contacts: ReadonlyArray<{ id: string; email: string | null; account_id: string }>,
  accounts: ReadonlyArray<{ id: string; domain: string | null }>,
): MatchResult {
  const a = address.toLowerCase();
  const c = contacts.find((x) => x.email?.toLowerCase() === a);
  if (c) return { kind: "contact", contactId: c.id, accountId: c.account_id };
  const domain = a.split("@")[1] ?? "";
  const acct = accounts.find((x) => x.domain && (domain === x.domain || domain.endsWith(`.${x.domain}`)));
  return acct ? { kind: "account_domain", accountId: acct.id } : { kind: "none" };
}
