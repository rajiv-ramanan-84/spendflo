import { hasUnresolvedToken, resolveTokens, tokenContext } from "@/lib/copy-tokens";

/** Why a step can't go out as it is. Null means ready. Pure, so the Tasks list and tests agree. */
export function needsEdit(s: { channel: string; subject: string | null; body: string | null; call_script: string | null }, contact: { full_name: string; title: string | null; email: string | null; linkedin_url: string | null; bounced?: boolean | null }, company: string): string | null {
  const ctx = tokenContext(contact, company, "Sender");
  const text = s.channel === "call" ? s.call_script ?? "" : s.body ?? "";
  if (s.channel === "email") {
    if (!contact.email || contact.bounced) return "No working email for this person";
    if (!s.subject?.trim()) return "Add a subject";
  }
  if (s.channel.startsWith("linkedin") && !contact.linkedin_url) return "No LinkedIn URL on file";
  if (!text.trim()) return s.channel === "call" ? "Add a call script" : "Add the message";
  if (hasUnresolvedToken(resolveTokens(`${s.subject ?? ""}\n${text}`, ctx))) return "Fill the placeholder in the copy";
  return null;
}
