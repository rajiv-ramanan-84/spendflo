import { finalizeEmail, finalizeLinkedIn } from "./compose";

type Signers = { names: string[]; emailSig: Map<string, string>; own: Map<string, string> };

/**
 * The finished text of one step. The app decides who signs, never Claude:
 * an email carries the signature of the person its mailbox writes as, and a
 * LinkedIn message the first name of the person whose profile sends it.
 * Calls are left alone: the opener already names the caller.
 */
export function finishStep(channel: string, body: string | null, o: { firstName: string | null; assigneeId: string | null }, s: Signers): string | null {
  if (!body) return body;
  const id = o.assigneeId ?? "";
  if (channel === "email") return finalizeEmail(body, { firstName: o.firstName, signature: s.emailSig.get(id) ?? null, names: s.names });
  if (channel.startsWith("linkedin")) return finalizeLinkedIn(body, { channel, signName: s.own.get(id) ?? null, names: s.names });
  return body;
}
