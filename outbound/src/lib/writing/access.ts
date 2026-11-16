import type { Role } from "@/lib/auth/team";

/**
 * Who may change which writing rule (pure).
 *  - Team and persona rules: admins and managers.
 *  - A sender's voice and signature: admins, and that person.
 *  - A mailbox's voice and signature: admins, and the people who run that mailbox.
 */
export type RuleScope = "team" | "persona" | "sender" | "mailbox";

export function canEditRule(o: { role: Role; userId: string | null; scope: RuleScope; key: string; runsMailbox: boolean }): boolean {
  if (o.role === "admin") return true;
  if (o.scope === "team" || o.scope === "persona") return o.role === "manager";
  if (o.scope === "sender") return !!o.userId && o.key === o.userId;
  return o.scope === "mailbox" && o.runsMailbox;
}
