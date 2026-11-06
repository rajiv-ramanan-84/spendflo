import { TOKEN_RE } from "@/lib/claude/copy-checks";

/** Personalisation tokens (PRD M5). Resolved before anything is copied or drafted. */

export type TokenContext = { first_name: string; last_name: string; full_name: string; company: string; title: string; sender_first_name: string };

const MAP: Record<string, keyof TokenContext> = {
  first_name: "first_name",
  firstname: "first_name",
  "first name": "first_name",
  name: "full_name",
  last_name: "last_name",
  full_name: "full_name",
  company: "company",
  account: "company",
  title: "title",
  sender: "sender_first_name",
  my_name: "sender_first_name",
};

export function tokenContext(contact: { full_name: string; title: string | null }, company: string, senderName: string): TokenContext {
  const parts = contact.full_name.trim().split(/\s+/);
  return {
    first_name: parts[0] ?? "",
    last_name: parts.length > 1 ? parts[parts.length - 1] : "",
    full_name: contact.full_name.trim(),
    company,
    title: contact.title ?? "",
    sender_first_name: senderName.trim().split(/\s+/)[0] ?? "",
  };
}

/** Replaces {first_name}, [First name] and similar. Unknown tokens are left in place so the guard catches them. */
export function resolveTokens(text: string, ctx: TokenContext): string {
  return text
    .replace(/\{\s*([a-z_ ]+?)\s*\}/gi, (m, key: string) => {
      const k = MAP[key.toLowerCase()];
      return k && ctx[k] ? ctx[k] : m;
    })
    .replace(/\[(first name|name|company|title)\]/gi, (m, key: string) => {
      const k = MAP[key.toLowerCase()];
      return k && ctx[k] ? ctx[k] : m;
    });
}

export function hasUnresolvedToken(text: string): boolean {
  return TOKEN_RE.test(text);
}
