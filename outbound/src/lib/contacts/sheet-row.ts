import { CONTACT_FIELDS, buildHeaderIndex, normalizeHeader } from "@/lib/sheet-sync/headers";
import { CONTACT_ID_RE } from "@/lib/sheet-sync/identity";

/**
 * Builds Contacts-tab rows for people found by web search. Pure, so the
 * column mapping is tested. Fills only what was found: name, title, company,
 * LinkedIn, location, source, and the two IDs. Never an email or a phone.
 */
export type FoundPerson = { full_name: string; title: string; linkedin_url: string; location: string | null; source_url: string | null; evidence: string };

export function nextContactNumber(contactIdColumn: readonly string[]): number {
  let max = 0;
  for (const v of contactIdColumn) {
    const t = (v ?? "").trim();
    if (CONTACT_ID_RE.test(t)) max = Math.max(max, Number(t.slice(4)));
  }
  return max + 1;
}

export function contactRows(header: readonly string[], idColumn: readonly string[], people: readonly FoundPerson[], account: { sheetAccountId: string; name: string }) {
  const idx = buildHeaderIndex(header, CONTACT_FIELDS).col;
  const at = (name: string) => header.findIndex((h) => normalizeHeader(h ?? "") === name);
  const foundIn = at("found in");
  if (idx.sheet_contact_key === undefined || idx.account_id === undefined || idx.full_name === undefined) {
    throw new Error("The Contacts tab needs Full Name, Account ID and Contact ID columns");
  }
  let n = nextContactNumber(idColumn);
  return people.map((p) => {
    const row = new Array<string>(header.length).fill("");
    const put = (i: number | undefined, v: string | null) => { if (i !== undefined && i >= 0 && v) row[i] = v; };
    put(idx.full_name, p.full_name);
    put(idx.title, p.title);
    put(idx.company, account.name);
    put(idx.linkedin_url, p.linkedin_url);
    put(idx.location, p.location);
    put(foundIn, "Claude web search (verify on LinkedIn)");
    put(idx.notes, [p.evidence, p.source_url ? `Source: ${p.source_url}` : null].filter(Boolean).join(" "));
    put(idx.account_id, account.sheetAccountId);
    put(idx.sheet_contact_key, `CON-${String(n++).padStart(4, "0")}`);
    return row;
  });
}
