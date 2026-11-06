/**
 * RFC 2822 message for a Gmail draft. Pure. Plain text, UTF-8, no tracking
 * pixels (PRD section 9). Headers are encoded so a name with an accent or an
 * em dash in a subject cannot break the message.
 */

function encodeHeader(v: string): string {
  return /^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function cleanHeaderValue(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

export function buildDraftMime(m: { from: string; to: string; toName?: string | null; subject: string; body: string; inReplyTo?: string | null; references?: string | null }): string {
  const to = m.toName ? `${encodeHeader(cleanHeaderValue(m.toName))} <${cleanHeaderValue(m.to)}>` : cleanHeaderValue(m.to);
  const headers = [
    `From: ${cleanHeaderValue(m.from)}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(cleanHeaderValue(m.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  if (m.inReplyTo) headers.push(`In-Reply-To: ${cleanHeaderValue(m.inReplyTo)}`);
  if (m.references) headers.push(`References: ${cleanHeaderValue(m.references)}`);
  const body = Buffer.from(m.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

/** Link that opens the draft in the sender's Gmail. */
export function gmailDraftLink(senderEmail: string, messageId: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(senderEmail)}#drafts?compose=${encodeURIComponent(messageId)}`;
}
