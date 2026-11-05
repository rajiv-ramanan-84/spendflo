/**
 * Stable IDs for the account book. The team never types an ID: the sync
 * assigns them, links contacts to accounts, and labels duplicates in the sheet.
 *
 * Pure functions. The same code runs on every hourly sync and ran the one-time
 * backfill, so the rules never drift.
 *
 * Duplicate policy
 * - Accounts: same domain, or same name after normalising, are one company.
 *   The row that already has an ID wins; otherwise the earliest row wins.
 *   The other row gets "DUPLICATE of ACC-xxx" and is not imported.
 * - Contacts: same LinkedIn URL or same email are one person. Same rule.
 * - A person whose duplicate sits under a different account goes to the review
 *   queue: one person belongs to one account.
 * - IDs are never reused or renumbered. Deleting a row retires its ID.
 */

export const ACCOUNT_ID_RE = /^ACC-\d{3,}$/;
export const CONTACT_ID_RE = /^CON-\d{4,}$/;
export const DUPLICATE_PREFIX = "DUPLICATE of ";
export const NO_MATCH_MARK = "CHECK: no matching account";
export const POSSIBLE_DUPLICATE_PREFIX = "POSSIBLE DUPLICATE of ";
/** Typed by a person in the ID cell to say "this is a different person, give it an ID". */
export const KEEP_MARK = "KEEP";

const CREDENTIALS = new Set(["mba", "pmp", "cpim", "phd", "cpa", "cpsm", "cscp", "jd", "md", "pe", "cma", "cfa", "jr", "sr", "ii", "iii"]);

/** "Thomas “Tom” Miller MBA" -> "thomas miller". Empty when there is no usable name. */
export function personKey(fullName: string): string {
  const words = fullName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[“”"(].*?[“”")]/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !CREDENTIALS.has(w));
  return words.length >= 2 ? `${words[0]} ${words[words.length - 1]}` : "";
}

const CORPORATE_SUFFIXES = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company", "llc", "ltd", "limited",
  "plc", "group", "holdings", "the", "usa", "us", "na", "americas",
]);

export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  const words = name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // "BD (Becton Dickinson)" -> "bd"
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept = words.filter((w) => !CORPORATE_SUFFIXES.has(w));
  return (kept.length ? kept : words).join(" ");
}

/** "https://www.Acme.com/ (est.)" -> "acme.com". "unverified" or junk -> null. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

export function emailDomain(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  return normalizeDomain(email.split("@").pop());
}

export function normalizeLinkedIn(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.toLowerCase().match(/linkedin\.com\/in\/([^/?#\s]+)/);
  return m ? `linkedin.com/in/${decodeURIComponent(m[1])}` : null;
}

/** Names agree loosely when they share a meaningful word ("CRH Americas" ~ "CRH", "HD Supply" !~ "The Home Depot"). */
export function namesOverlap(a: string, b: string): boolean {
  const ta = new Set(normalizeName(a).split(" ").filter((w) => w.length >= 3 || /^[a-z]{2}$/.test(w)));
  return normalizeName(b)
    .split(" ")
    .some((w) => (w.length >= 3 || /^[a-z]{2}$/.test(w)) && ta.has(w));
}

/** Person names agree when they share a word of 3+ letters ("Morgan Phares Selor" ~ "Morgan Selor"). */
export function personNamesOverlap(a: string, b: string): boolean {
  const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3);
  const wa = new Set(words(a));
  return words(b).some((w) => wa.has(w));
}

/** true when `d` is `base` or a subdomain of it (us.bd.com belongs to bd.com). */
function domainBelongsTo(d: string, base: string) {
  return d === base || d.endsWith(`.${base}`);
}

function idNumber(id: string) {
  return Number(id.split("-")[1]);
}

function formatId(prefix: "ACC" | "CON", n: number) {
  return `${prefix}-${String(n).padStart(prefix === "ACC" ? 3 : 4, "0")}`;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export type AccountRow = { row: number; idCell: string; name: string; domain: string };

export type AccountAssignment =
  | { row: number; kind: "keep"; id: string }
  | { row: number; kind: "new"; id: string }
  | { row: number; kind: "duplicate"; duplicateOf: string; reason: "same_domain" | "same_name" | "same_id" }
  | { row: number; kind: "skip"; reason: "no_name" };

export function assignAccountIds(rows: readonly AccountRow[]): AccountAssignment[] {
  let maxId = 0;
  for (const r of rows) if (ACCOUNT_ID_RE.test(r.idCell.trim())) maxId = Math.max(maxId, idNumber(r.idCell.trim()));

  // Rows that already carry an ID claim it first, so existing IDs never move.
  const ordered = [...rows].sort((a, b) => {
    const ah = ACCOUNT_ID_RE.test(a.idCell.trim()) ? 0 : 1;
    const bh = ACCOUNT_ID_RE.test(b.idCell.trim()) ? 0 : 1;
    return ah - bh || a.row - b.row;
  });

  const byDomain = new Map<string, string>();
  const byName = new Map<string, string>();
  const seenIds = new Set<string>();
  const out = new Map<number, AccountAssignment>();

  for (const r of ordered) {
    const name = normalizeName(r.name);
    if (!name) {
      out.set(r.row, { row: r.row, kind: "skip", reason: "no_name" });
      continue;
    }
    const domain = normalizeDomain(r.domain);
    const existing = r.idCell.trim();
    const hasId = ACCOUNT_ID_RE.test(existing);

    const domainMatch = domain ? byDomain.get(domain) : undefined;
    const nameMatch = byName.get(name);
    const dupOf = domainMatch ?? nameMatch;

    if (hasId && seenIds.has(existing)) {
      out.set(r.row, { row: r.row, kind: "duplicate", duplicateOf: existing, reason: "same_id" });
      continue;
    }
    if (dupOf && dupOf !== existing) {
      out.set(r.row, { row: r.row, kind: "duplicate", duplicateOf: dupOf, reason: domainMatch ? "same_domain" : "same_name" });
      continue;
    }

    const id = hasId ? existing : formatId("ACC", ++maxId);
    seenIds.add(id);
    if (domain) byDomain.set(domain, id);
    byName.set(name, id);
    out.set(r.row, hasId ? { row: r.row, kind: "keep", id } : { row: r.row, kind: "new", id });
  }
  return rows.map((r) => out.get(r.row)!);
}

// ---------------------------------------------------------------------------
// Linking contacts to accounts
// ---------------------------------------------------------------------------

export type AccountIndexEntry = { id: string; name: string; domain: string | null };

export type ContactLink =
  | { accountId: string; method: "account_id" | "email_domain" | "company_domain" | "company_name" }
  | { accountId: null; reason: "no_match" | "ambiguous"; candidates?: string[] };

export function buildAccountIndex(accounts: readonly AccountIndexEntry[]) {
  const ids = new Set(accounts.map((a) => a.id));
  const byName = new Map<string, string[]>();
  for (const a of accounts) {
    const n = normalizeName(a.name);
    byName.set(n, [...(byName.get(n) ?? []), a.id]);
  }
  const withDomain = accounts.filter((a) => a.domain) as Array<AccountIndexEntry & { domain: string }>;
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  function byDomain(d: string | null): string[] {
    if (!d) return [];
    return withDomain.filter((a) => domainBelongsTo(d, a.domain)).map((a) => a.id);
  }
  return { ids, byName, byDomain, nameById };
}

export function linkContact(
  contact: { accountIdCell: string; company: string; email: string; companyDomain: string },
  index: ReturnType<typeof buildAccountIndex>,
): ContactLink {
  const explicit = contact.accountIdCell.trim();
  if (ACCOUNT_ID_RE.test(explicit) && index.ids.has(explicit)) return { accountId: explicit, method: "account_id" };

  const uniq = (xs: string[]) => [...new Set(xs)];

  // The work email is where we will actually write, so it is the strongest signal.
  const byEmail = uniq(index.byDomain(emailDomain(contact.email)));
  if (byEmail.length === 1) return { accountId: byEmail[0], method: "email_domain" };
  if (byEmail.length > 1) return { accountId: null, reason: "ambiguous", candidates: byEmail };

  // Enrichment domain and company name are weaker signals.
  const company = contact.company.trim();
  const domainHits = uniq(index.byDomain(normalizeDomain(contact.companyDomain)));
  const byName = uniq(index.byName.get(normalizeName(company)) ?? []);

  // Name and domain point at two different accounts we own (an "Amazon"
  // contact with a Whole Foods domain): a human decides.
  if (byName.length && domainHits.some((id) => !byName.includes(id))) {
    return { accountId: null, reason: "ambiguous", candidates: uniq([...domainHits, ...byName]) };
  }
  if (byName.length > 1) return { accountId: null, reason: "ambiguous", candidates: byName };
  if (byName.length === 1) return { accountId: byName[0], method: "company_name" };

  // No name match. Enrichment domains are often stale or wrong ("Self
  // Employed" with a herbalife.com domain), so a domain alone only counts
  // when the company name is blank or loosely agrees with the account.
  const byCompanyDomain = domainHits.filter((id) => !company || namesOverlap(company, index.nameById.get(id) ?? ""));
  if (byCompanyDomain.length === 1) return { accountId: byCompanyDomain[0], method: "company_domain" };
  if (byCompanyDomain.length > 1) return { accountId: null, reason: "ambiguous", candidates: byCompanyDomain };
  return { accountId: null, reason: "no_match" };
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export type ContactRow = {
  row: number;
  idCell: string;
  fullName: string;
  email: string;
  linkedinUrl: string;
  accountId: string | null;
};

export type ContactAssignment =
  | { row: number; kind: "keep" | "new"; id: string }
  | { row: number; kind: "duplicate"; duplicateOf: string; reason: "same_linkedin" | "same_email" | "same_id" }
  | { row: number; kind: "conflict"; id: string; otherId: string; reason: "same_person_two_accounts" | "shared_email_different_people" }
  | { row: number; kind: "possible_duplicate"; duplicateOf: string; reason: "same_name_same_account" };

export function assignContactIds(rows: readonly ContactRow[]): ContactAssignment[] {
  let maxId = 0;
  for (const r of rows) if (CONTACT_ID_RE.test(r.idCell.trim())) maxId = Math.max(maxId, idNumber(r.idCell.trim()));

  // Rows with an ID claim first, then rows with a name, then sheet order, so
  // the most complete copy of a person survives.
  const rank = (r: ContactRow) => (CONTACT_ID_RE.test(r.idCell.trim()) ? 0 : r.fullName.trim() ? 1 : 2);
  const ordered = [...rows].sort((a, b) => rank(a) - rank(b) || a.row - b.row);

  type Seen = { id: string; accountId: string | null; fullName: string };
  const byLinkedIn = new Map<string, Seen>();
  const byEmail = new Map<string, Seen>();
  const byNameAtAccount = new Map<string, Seen>();
  const seenIds = new Set<string>();
  const out = new Map<number, ContactAssignment>();

  for (const r of ordered) {
    const li = normalizeLinkedIn(r.linkedinUrl);
    const em = r.email.trim().toLowerCase() || null;
    const existing = r.idCell.trim();
    const hasId = CONTACT_ID_RE.test(existing);
    const keepRequested = existing.toUpperCase() === KEEP_MARK;
    const nameKey = r.accountId && personKey(r.fullName) ? `${personKey(r.fullName)}|${r.accountId}` : null;

    if (hasId && seenIds.has(existing)) {
      out.set(r.row, { row: r.row, kind: "duplicate", duplicateOf: existing, reason: "same_id" });
      continue;
    }
    const liMatch = li ? byLinkedIn.get(li) : undefined;
    let emMatch = em ? byEmail.get(em) : undefined;

    // Same email, clearly different people: the enrichment guessed the email
    // (cg@ for two people with initials C.G.). Keep both, flag for review.
    if (!liMatch && emMatch && r.fullName.trim() && emMatch.fullName.trim() && !personNamesOverlap(r.fullName, emMatch.fullName)) {
      const id = hasId ? existing : formatId("CON", ++maxId);
      seenIds.add(id);
      out.set(r.row, { row: r.row, kind: "conflict", id, otherId: emMatch.id, reason: "shared_email_different_people" });
      if (li) byLinkedIn.set(li, { id, accountId: r.accountId, fullName: r.fullName });
      emMatch = undefined;
      continue;
    }
    const match = liMatch ?? emMatch;

    if (match && match.id !== existing) {
      if (match.accountId && r.accountId && match.accountId !== r.accountId) {
        // Same person under two accounts: keep both rows out of the way until a human decides.
        const id = hasId ? existing : formatId("CON", ++maxId);
        seenIds.add(id);
        out.set(r.row, { row: r.row, kind: "conflict", id, otherId: match.id, reason: "same_person_two_accounts" });
        continue;
      }
      out.set(r.row, { row: r.row, kind: "duplicate", duplicateOf: match.id, reason: liMatch ? "same_linkedin" : "same_email" });
      continue;
    }

    // Same name at the same account but no shared LinkedIn or email: very
    // likely one person with two profiles. Hold it back until a person
    // decides, unless they already typed KEEP or the row already has an ID.
    const nameMatch = nameKey ? byNameAtAccount.get(nameKey) : undefined;
    if (nameMatch && !hasId && !keepRequested) {
      out.set(r.row, { row: r.row, kind: "possible_duplicate", duplicateOf: nameMatch.id, reason: "same_name_same_account" });
      continue;
    }

    const id = hasId ? existing : formatId("CON", ++maxId);
    seenIds.add(id);
    const entry = { id, accountId: r.accountId, fullName: r.fullName };
    if (nameKey && !byNameAtAccount.has(nameKey)) byNameAtAccount.set(nameKey, entry);
    if (li) byLinkedIn.set(li, entry);
    if (em) byEmail.set(em, entry);
    out.set(r.row, { row: r.row, kind: hasId ? "keep" : "new", id });
  }
  return rows.map((r) => out.get(r.row)!);
}

/** What the sync writes into the sheet's ID cell for a row. */
export function idCellValue(a: AccountAssignment | ContactAssignment): string | null {
  switch (a.kind) {
    case "keep":
      return null; // already correct, never rewrite
    case "new":
    case "conflict":
      return a.id;
    case "duplicate":
      return `${DUPLICATE_PREFIX}${a.duplicateOf}`;
    case "possible_duplicate":
      return `${POSSIBLE_DUPLICATE_PREFIX}${a.duplicateOf}`;
    default:
      return null;
  }
}
