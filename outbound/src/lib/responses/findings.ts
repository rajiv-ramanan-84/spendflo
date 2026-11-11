/**
 * A re-plan comes back with two kinds of findings. Errors stop a contact's steps from being applied
 * (a step with nowhere to go, no date, no copy). Everything else is Claude's advice for the owner to read,
 * such as "no VP in contacts" or "check the copy against the playbook". Advice never blocks. Pure.
 */

export type Finding = { text: string; contactId?: string; sequenceNo?: number };

const HARD = /has no (email|LinkedIn URL)|no usable date|has no copy|has no subject|unresolved placeholder|before any connect request|not a contact on this account|no usable tracks|channel Other|claims a connection|connect note is \d+ characters/i;

export function splitFindings(all: readonly Finding[]): { errors: Finding[]; advice: Finding[] } {
  const errors: Finding[] = [];
  const advice: Finding[] = [];
  for (const f of all) (HARD.test(f.text) ? errors : advice).push(f);
  return { errors, advice };
}

/** Contacts that cannot be applied because one of their steps has an error. Errors with no contact stop the whole plan. */
export function blockedContacts(errors: readonly Finding[]): { contacts: Set<string>; wholePlan: boolean } {
  const contacts = new Set<string>();
  let wholePlan = false;
  for (const e of errors) { if (e.contactId) contacts.add(e.contactId); else wholePlan = true; }
  return { contacts, wholePlan };
}
