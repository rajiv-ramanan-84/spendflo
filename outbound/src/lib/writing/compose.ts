/**
 * Writing rules and finished emails. Pure: no database, no clock.
 * Claude writes the body. The app adds the greeting and the sender's signature,
 * so every email arrives in Gmail complete, whatever Claude returned.
 */

export type WritingRules = {
  team: string;
  personas: Record<string, string>;
  senders: Record<string, { voice: string; signature: string }>;
};

export const EMPTY_RULES: WritingRules = { team: "", personas: {}, senders: {} };

/** What Claude is told for one campaign: the team's rules, the sender's voice, and only the personas on this account. */
export function writingForPayload(rules: WritingRules, senderId: string | null, senderName: string, personas: Array<string | null>) {
  const sender = senderId ? rules.senders[senderId] : undefined;
  const wanted = [...new Set(personas.filter((p): p is string => !!p))];
  const byPersona = Object.fromEntries(wanted.filter((p) => rules.personas[p]?.trim()).map((p) => [p, rules.personas[p].trim()]));
  const out = {
    team: rules.team.trim() || undefined,
    sender: { name: senderName, voice: sender?.voice.trim() || undefined },
    personas: Object.keys(byPersona).length ? byPersona : undefined,
  };
  return out.team || out.sender.voice || out.personas ? out : null;
}

export function firstNameOf(full: string | null | undefined): string | null {
  const n = (full ?? "").trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "");
  return n || null;
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GREETING = /^\s*(hi|hello|hey|dear|good (morning|afternoon|evening))\b[^\n]*\n+/i;
const SIGN_OFF = /^(best|best regards|kind regards|regards|thanks|thank you|cheers|sincerely|warm regards|talk soon)[,.!]?$/i;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.?!])\s+(?=[A-Z"'(])/).map((s) => s.trim()).filter(Boolean);
}

/**
 * A complete email: "Hi Dan," then short paragraphs, then the sender's signature.
 * Safe to run twice. A greeting or sign-off Claude wrote is replaced, not doubled.
 */
export function finalizeEmail(body: string, o: { firstName: string | null; signature: string | null; names?: string[] }): string {
  let t = body.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  t = t.replace(/\s*—\s*/g, ", ");
  t = t.replace(GREETING, "");

  // Drop a trailing sign-off: "Best," lines, the sender's own name, or the signature already there.
  const lines = t.split("\n");
  const sigLines = (o.signature ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const first = sigLines[0]?.toLowerCase();
  const nameLine = o.names?.length ? new RegExp(`^(?:${o.names.map(escapeRe).join("|")})(?:,?\\s*(?:spendflo|co-?founder.*|cro.*|global head.*))?$`, "i") : null;
  // A sign-off can be more than one line: "Mouli", then "Spendflo" or a title. All of it goes before the signature is added.
  const TITLE = /^(spendflo|(global )?(head|vp|vice president|director)\b.*|co-?founder.*|cro\b.*|ceo\b.*|chief .*)$/i;
  const tail = (l: string) => { const x = l.trim(); return !x || SIGN_OFF.test(x) || (first !== undefined && x.toLowerCase() === first) || sigLines.some((s) => s === x) || !!nameLine?.test(x) || (x.split(/\s+/).length <= 8 && !/[.?!]$/.test(x) && TITLE.test(x)); };
  while (lines.length && tail(lines[lines.length - 1])) lines.pop();
  t = lines.join("\n").trim();

  // One block of text becomes short paragraphs, two sentences at most each.
  if (!/\n\s*\n/.test(t) && !t.includes("\n")) {
    const s = sentencesOf(t);
    if (s.length >= 3) {
      const paras: string[] = [];
      for (let i = 0; i < s.length; i += 2) paras.push(s.slice(i, i + 2).join(" "));
      // Keep a closing question on its own.
      const last = s[s.length - 1];
      if (last.endsWith("?") && paras[paras.length - 1] !== last) {
        paras[paras.length - 1] = paras[paras.length - 1].replace(new RegExp(`\\s*${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
        if (!paras[paras.length - 1]) paras.pop();
        paras.push(last);
      }
      t = paras.join("\n\n");
    }
  }
  t = t.replace(/\n{3,}/g, "\n\n");

  const parts = [o.firstName ? `Hi ${o.firstName},` : "", t, sigLines.join("\n")].filter(Boolean);
  return parts.join("\n\n");
}

/** Plain-language warnings shown next to an email. None of them block a send. */
export function emailChecks(subject: string | null, body: string): string[] {
  const w: string[] = [];
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (words > 120) w.push(`${words} words. First emails read best under 100.`);
  if (/—/.test(`${subject ?? ""} ${body}`)) w.push("Contains an em dash.");
  const sw = (subject ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (subject && (sw < 2 || sw > 9)) w.push(`The subject is ${sw} word${sw === 1 ? "" : "s"}. 3 to 8 reads best.`);
  return w;
}

/**
 * LinkedIn copy. The app, not Claude, decides who signs. A connect note is not signed at all: the request
 * already shows the sender's name and every character counts. A message ends with the sender's own first name.
 * Whatever name Claude put at the end is replaced, so the text always matches the profile it goes from.
 */
export function finalizeLinkedIn(body: string, o: { channel: string; signName: string | null; names: string[] }): string {
  let t = body.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\s*—\s*/g, ", ").trim();
  const names = o.names.length ? o.names.map(escapeRe).join("|") : null;
  const generic = "best|best regards|kind regards|regards|thanks|thank you|cheers|sincerely|talk soon";
  for (let i = 0; i < 3; i++) {
    const before = t;
    if (names) t = t.replace(new RegExp(`(?<=[.?!\\n])[\\s,.-]*(?:(?:${generic}),?\\s*)?\\b(?:${names})\\b(?:,?\\s*(?:spendflo|co-?founder[^\\n]*|cro[^\\n]*))?\\s*$`, "i"), "").trim();
    t = t.replace(new RegExp(`(?<=[.?!\\n])\\s*(?:${generic})[,.!]?\\s*$`, "i"), "").trim();
    if (t === before) break;
  }
  if (o.channel !== "linkedin_connect" && o.signName) t = `${t}\n\n${o.signName}`;
  return t;
}
