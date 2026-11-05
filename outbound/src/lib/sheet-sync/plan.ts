import { buildHeaderIndex, CONTACT_FIELDS, MASTER_FIELDS } from "./headers";
import {
  assignAccountIds,
  assignContactIds,
  buildAccountIndex,
  emailDomain,
  idCellValue,
  linkContact,
  NO_MATCH_MARK,
  normalizeDomain,
  normalizeLinkedIn,
} from "./identity";
import { parseContactRow, parseMasterRow, type ParsedAccount, type ParsedContact, type Persona, type Tier, type Verdict } from "./parse";

/**
 * Turns the sheet plus the current database state into a plan. Pure: no I/O.
 * The runner applies the plan; a dry run just prints it.
 *
 * Ownership rules (PRD M1):
 * - Research fields and contacts: the sheet wins, every sync.
 * - Owner and tier: the sheet sets them on first import only. After that the
 *   app owns them and a different sheet owner shows as a hint.
 * - Campaigns, steps, responses, status: the app only. Never touched here.
 * - Rows deleted from the sheet are flagged, never deleted.
 * - Do-not-contact survives every sync.
 */

export type ExistingAccount = { id: string; ownerId: string | null; sheetDeleted: boolean };
export type ExistingContact = { id: string; title: string; accountSheetId: string; sheetDeleted: boolean };

export type SyncSnapshot = {
  accounts: Map<string, ExistingAccount>; // by sheet_account_id
  contacts: Map<string, ExistingContact>; // by sheet_contact_key
  dncEmails: Set<string>;
  dncLinkedIns: Set<string>; // normalized
  /** lower-case first name or full name -> user id, e.g. "rajiv", "sid", "mouli", "shweta" */
  usersByName: Map<string, string>;
};

export type CellWrite = { tab: "master" | "contacts"; row: number; col: number; value: string };

export type DqIssueType =
  | "missing_header"
  | "duplicate_account"
  | "missing_verdict"
  | "missing_tier"
  | "verdict_tier_mismatch"
  | "unknown_owner"
  | "unlinked_contact"
  | "duplicate_contact"
  | "possible_duplicate_contact"
  | "shared_email"
  | "same_person_two_accounts"
  | "no_email_no_linkedin"
  | "retired_title"
  | "email_domain_mismatch";

export type DqIssue = { tab: "master" | "contacts"; row: number; key: string; type: DqIssueType; details: string };

export type AccountUpsert = {
  sheetAccountId: string;
  row: number;
  isNew: boolean;
  archived: boolean;
  tier: Tier | null;
  verdict: Verdict | null;
  /** set on first import only */
  ownerId: string | null;
  sheetOwnerHint: string | null;
  fields: Omit<ParsedAccount["sheet"], "owner" | "tier" | "icp_verdict">;
  custom_fields: Record<string, string>;
};

export type ContactUpsert = {
  sheetContactKey: string;
  accountSheetId: string;
  row: number;
  isNew: boolean;
  changed: boolean;
  doNotContact: boolean;
  persona: Persona | null;
  fields: Omit<ParsedContact["sheet"], "persona">;
  linkedin_signals: Record<string, string>;
};

export type SyncPlan = {
  ok: boolean;
  fatal: string[];
  accounts: AccountUpsert[];
  contacts: ContactUpsert[];
  flagDeletedAccounts: string[];
  flagDeletedContacts: string[];
  sheetWrites: CellWrite[];
  dq: DqIssue[];
  autoDraft: string[]; // sheet account ids
  counts: {
    masterRows: number;
    accountsActive: number;
    accountsArchived: number;
    accountsNew: number;
    accountsNotImported: number;
    contactRows: number;
    contactsImported: number;
    contactsNew: number;
    contactsNotImported: number;
    idCellsWritten: number;
  };
};

const ACTIVE_VERDICTS = new Set<Verdict>(["fit", "maybe"]);

function isBlank(row: readonly string[] | undefined) {
  return !row || row.every((v) => !String(v ?? "").trim());
}

export function planSync(master: string[][], contactsSheet: string[][], snap: SyncSnapshot): SyncPlan {
  const fatal: string[] = [];
  const dq: DqIssue[] = [];
  const sheetWrites: CellWrite[] = [];

  const mHdr = master[0] ?? [];
  const cHdr = contactsSheet[0] ?? [];
  const mIdx = buildHeaderIndex(mHdr, MASTER_FIELDS);
  const cIdx = buildHeaderIndex(cHdr, CONTACT_FIELDS);

  for (const f of ["sheet_account_id", "name", "tier", "icp_verdict", "domain"] as const) {
    if (mIdx.col[f] === undefined) fatal.push(`Master is missing the "${MASTER_FIELDS[f][0]}" column`);
  }
  for (const f of ["sheet_contact_key", "account_id", "full_name"] as const) {
    if (cIdx.col[f] === undefined) fatal.push(`Contacts is missing the "${CONTACT_FIELDS[f][0]}" column`);
  }
  if (cIdx.col.email === undefined && cIdx.col.linkedin_url === undefined) fatal.push("Contacts needs an email or a LinkedIn URL column");

  const empty: SyncPlan = {
    ok: false,
    fatal,
    accounts: [],
    contacts: [],
    flagDeletedAccounts: [],
    flagDeletedContacts: [],
    sheetWrites: [],
    dq: fatal.map((f) => ({ tab: "master", row: 1, key: "", type: "missing_header", details: f })),
    autoDraft: [],
    counts: {
      masterRows: 0, accountsActive: 0, accountsArchived: 0, accountsNew: 0, accountsNotImported: 0,
      contactRows: 0, contactsImported: 0, contactsNew: 0, contactsNotImported: 0, idCellsWritten: 0,
    },
  };
  if (fatal.length) return empty;

  // ---- Accounts --------------------------------------------------------------
  const parsedAccounts: ParsedAccount[] = [];
  master.slice(1).forEach((r, i) => {
    if (isBlank(r)) return;
    parsedAccounts.push(parseMasterRow(r, i + 2, mIdx));
  });

  const accountAssign = assignAccountIds(parsedAccounts.map((a) => ({ row: a.row, idCell: a.idCell, name: a.sheet.name, domain: a.sheet.domain })));
  const accounts: AccountUpsert[] = [];
  const importedAccounts: Array<{ id: string; name: string; domain: string | null; parsed: ParsedAccount; upsert: AccountUpsert }> = [];
  let accountsNotImported = 0;

  parsedAccounts.forEach((a, i) => {
    const asg = accountAssign[i];
    const write = idCellValue(asg);
    if (write !== null && write !== a.idCell) {
      sheetWrites.push({ tab: "master", row: a.row, col: mIdx.col.sheet_account_id!, value: write });
    }
    if (asg.kind === "skip") return;
    if (asg.kind === "duplicate") {
      accountsNotImported++;
      dq.push({ tab: "master", row: a.row, key: a.sheet.name, type: "duplicate_account", details: `Same company as ${asg.duplicateOf} (${asg.reason.replace("_", " ")})` });
      return;
    }

    const id = asg.id;
    const existing = snap.accounts.get(id);
    const ownerKey = a.sheet.owner.trim().toLowerCase();
    const sheetOwnerId = ownerKey ? (snap.usersByName.get(ownerKey) ?? null) : null;
    if (ownerKey && !sheetOwnerId) dq.push({ tab: "master", row: a.row, key: id, type: "unknown_owner", details: `Owner "${a.sheet.owner}" is not a user` });
    if (!a.sheet.icp_verdict) dq.push({ tab: "master", row: a.row, key: id, type: "missing_verdict", details: "ICP Verdict is blank or not FIT, MAYBE or NO-FIT; imported as archived" });
    if (!a.sheet.tier) dq.push({ tab: "master", row: a.row, key: id, type: "missing_tier", details: "Tier is blank or not A to D" });
    if (a.sheet.tier === "D" && a.sheet.icp_verdict === "fit") {
      dq.push({ tab: "master", row: a.row, key: id, type: "verdict_tier_mismatch", details: "Tier D but ICP Verdict FIT; check which is right" });
    }

    const fields = researchFields(a.sheet);
    const upsert: AccountUpsert = {
      sheetAccountId: id,
      row: a.row,
      isNew: !existing,
      archived: !a.sheet.icp_verdict || !ACTIVE_VERDICTS.has(a.sheet.icp_verdict),
      tier: a.sheet.tier,
      verdict: a.sheet.icp_verdict,
      ownerId: existing ? null : sheetOwnerId,
      sheetOwnerHint: existing && sheetOwnerId && existing.ownerId && sheetOwnerId !== existing.ownerId ? a.sheet.owner : null,
      fields,
      custom_fields: a.custom_fields,
    };
    accounts.push(upsert);
    importedAccounts.push({ id, name: a.sheet.name, domain: normalizeDomain(a.sheet.domain), parsed: a, upsert });
  });

  // ---- Contacts --------------------------------------------------------------
  const index = buildAccountIndex(importedAccounts.map((a) => ({ id: a.id, name: a.name, domain: a.domain })));
  const accountById = new Map(importedAccounts.map((a) => [a.id, a]));

  const parsedContacts: ParsedContact[] = [];
  contactsSheet.slice(1).forEach((r, i) => {
    if (isBlank(r)) return;
    parsedContacts.push(parseContactRow(r, i + 2, cIdx, cHdr));
  });

  const links = parsedContacts.map((c) =>
    linkContact({ accountIdCell: c.accountIdCell, company: c.company, email: c.sheet.email, companyDomain: c.companyDomain }, index),
  );
  const contactAssign = assignContactIds(
    parsedContacts.map((c, i) => ({
      row: c.row,
      idCell: c.idCell,
      fullName: c.sheet.full_name,
      email: c.sheet.email,
      linkedinUrl: c.sheet.linkedin_url,
      accountId: links[i].accountId,
    })),
  );

  const contacts: ContactUpsert[] = [];
  let contactsNotImported = 0;

  parsedContacts.forEach((c, i) => {
    const asg = contactAssign[i];
    const link = links[i];
    const label = c.sheet.full_name || c.sheet.linkedin_url || `row ${c.row}`;

    const idWrite = idCellValue(asg);
    if (idWrite !== null && idWrite !== c.idCell) sheetWrites.push({ tab: "contacts", row: c.row, col: cIdx.col.sheet_contact_key!, value: idWrite });

    const accountCellValue = link.accountId ?? (link.reason === "ambiguous" ? `CHECK: could be ${link.candidates!.join(" or ")}` : NO_MATCH_MARK);
    if (accountCellValue !== c.accountIdCell) sheetWrites.push({ tab: "contacts", row: c.row, col: cIdx.col.account_id!, value: accountCellValue });

    const skip = (type: DqIssueType, details: string) => {
      contactsNotImported++;
      dq.push({ tab: "contacts", row: c.row, key: label, type, details });
    };

    if (asg.kind === "duplicate") return skip("duplicate_contact", `Same person as ${asg.duplicateOf} (${asg.reason.replace("_", " ")})`);
    if (asg.kind === "possible_duplicate") return skip("possible_duplicate_contact", `Same name at the same account as ${asg.duplicateOf}. Delete the row, or type KEEP in Contact ID if it is a different person`);
    if (asg.kind === "conflict" && asg.reason === "same_person_two_accounts") return skip("same_person_two_accounts", `Also listed as ${asg.otherId} under another account`);
    if (link.accountId === null) return skip("unlinked_contact", link.reason === "ambiguous" ? `Could be ${link.candidates!.join(" or ")}` : `No account matches "${c.company}"`);
    if (!c.sheet.email && !c.sheet.linkedin_url) return skip("no_email_no_linkedin", "No email and no LinkedIn URL");
    if (/\bretired\b/i.test(c.sheet.title)) return skip("retired_title", `Title says "${c.sheet.title}"`);

    const account = accountById.get(link.accountId)!;
    const ed = emailDomain(c.sheet.email);
    if (ed && account.domain && link.method !== "account_id" && !(ed === account.domain || ed.endsWith(`.${account.domain}`))) {
      return skip("email_domain_mismatch", `Email domain ${ed} is not ${account.domain}. Type ${link.accountId} in Account ID to confirm`);
    }
    if (asg.kind === "conflict") {
      dq.push({ tab: "contacts", row: c.row, key: label, type: "shared_email", details: `Shares an email with ${asg.otherId}; one of them is likely wrong` });
    }

    const key = asg.id;
    const existing = snap.contacts.get(key);
    const li = normalizeLinkedIn(c.sheet.linkedin_url);
    const { persona, ...fields } = c.sheet;
    contacts.push({
      sheetContactKey: key,
      accountSheetId: link.accountId,
      row: c.row,
      isNew: !existing,
      changed: !!existing && existing.title.trim().toLowerCase() !== c.sheet.title.trim().toLowerCase(),
      doNotContact: (!!c.sheet.email && snap.dncEmails.has(c.sheet.email)) || (!!li && snap.dncLinkedIns.has(li)),
      persona,
      fields,
      linkedin_signals: c.linkedin_signals,
    });
  });

  // ---- Deletions, auto-draft, counts ---------------------------------------
  const sheetAccountIds = new Set(accounts.map((a) => a.sheetAccountId));
  const sheetContactKeys = new Set(contacts.map((c) => c.sheetContactKey));
  // A contact held back this run (review, unlinked) is still in the sheet: do not flag it deleted.
  for (const a of contactAssign) if (a.kind === "new" || a.kind === "keep" || a.kind === "conflict") sheetContactKeys.add(a.id);

  const flagDeletedAccounts = [...snap.accounts.entries()].filter(([k, v]) => !sheetAccountIds.has(k) && !v.sheetDeleted).map(([k]) => k);
  const flagDeletedContacts = [...snap.contacts.entries()].filter(([k, v]) => !sheetContactKeys.has(k) && !v.sheetDeleted).map(([k]) => k);

  const usable = new Map<string, number>();
  for (const c of contacts) if (!c.fields.exclude && !c.doNotContact) usable.set(c.accountSheetId, (usable.get(c.accountSheetId) ?? 0) + 1);
  const autoDraft = accounts
    .filter((a) => a.isNew && !a.archived && (a.tier === "A" || a.tier === "B") && a.ownerId && !a.fields.do_not_contact && (usable.get(a.sheetAccountId) ?? 0) > 0)
    .map((a) => a.sheetAccountId);

  return {
    ok: true,
    fatal,
    accounts,
    contacts,
    flagDeletedAccounts,
    flagDeletedContacts,
    sheetWrites,
    dq,
    autoDraft,
    counts: {
      masterRows: parsedAccounts.length,
      accountsActive: accounts.filter((a) => !a.archived).length,
      accountsArchived: accounts.filter((a) => a.archived).length,
      accountsNew: accounts.filter((a) => a.isNew).length,
      accountsNotImported,
      contactRows: parsedContacts.length,
      contactsImported: contacts.length,
      contactsNew: contacts.filter((c) => c.isNew).length,
      contactsNotImported,
      idCellsWritten: sheetWrites.length,
    },
  };
}

function researchFields(s: ParsedAccount["sheet"]): AccountUpsert["fields"] {
  const { owner, tier, icp_verdict, ...rest } = s;
  void owner; void tier; void icp_verdict; // owner and tier are first-import only; verdict drives archived
  return rest;
}
