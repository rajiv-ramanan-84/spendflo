import { describe, expect, it } from "vitest";
import {
  assignAccountIds,
  assignContactIds,
  buildAccountIndex,
  idCellValue,
  linkContact,
  normalizeDomain,
  normalizeLinkedIn,
  normalizeName,
} from "@/lib/sheet-sync/identity";

const acc = (row: number, name: string, domain: string, idCell = "") => ({ row, idCell, name, domain });

describe("normalisers", () => {
  it("normalise company names", () => {
    expect(normalizeName("BD (Becton Dickinson)")).toBe("bd");
    expect(normalizeName("Wawa, Inc.")).toBe("wawa");
    expect(normalizeName("Learning Care Group")).toBe(normalizeName("Learning Care"));
    expect(normalizeName("The Clorox Company")).toBe("clorox");
    expect(normalizeName("Procter & Gamble")).toBe("procter and gamble");
  });

  it("normalise domains and reject junk", () => {
    expect(normalizeDomain("https://www.Cortland.com/")).toBe("cortland.com");
    expect(normalizeDomain("ta.com (est.)")).toBe("ta.com");
    expect(normalizeDomain("unverified")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
  });

  it("normalise LinkedIn URLs", () => {
    expect(normalizeLinkedIn("https://www.linkedin.com/in/Jane-Doe-12/?trk=x")).toBe("linkedin.com/in/jane-doe-12");
    expect(normalizeLinkedIn("not a url")).toBeNull();
  });
});

describe("assignAccountIds", () => {
  it("numbers new accounts in sheet order", () => {
    const out = assignAccountIds([acc(2, "Andersen", "andersenwindows.com"), acc(3, "Cortland", "cortland.com")]);
    expect(out).toEqual([
      { row: 2, kind: "new", id: "ACC-001" },
      { row: 3, kind: "new", id: "ACC-002" },
    ]);
  });

  it("never moves an existing ID and continues after the highest", () => {
    const out = assignAccountIds([acc(2, "New Co", "new.com"), acc(3, "Cortland", "cortland.com", "ACC-007")]);
    expect(out).toEqual([
      { row: 2, kind: "new", id: "ACC-008" },
      { row: 3, kind: "keep", id: "ACC-007" },
    ]);
  });

  it("flags GameStop twice as one company by domain, first row wins", () => {
    const out = assignAccountIds([acc(4, "GameStop", "gamestop.com"), acc(91, "GAMESTOP INC", "gamestop.com")]);
    expect(out[1]).toEqual({ row: 91, kind: "duplicate", duplicateOf: "ACC-001", reason: "same_domain" });
    expect(idCellValue(out[1])).toBe("DUPLICATE of ACC-001");
  });

  it("lets the row that already has an ID win, even if it is lower in the sheet", () => {
    const out = assignAccountIds([acc(4, "GameStop", "gamestop.com"), acc(91, "GAMESTOP INC", "gamestop.com", "ACC-003")]);
    expect(out[0]).toEqual({ row: 4, kind: "duplicate", duplicateOf: "ACC-003", reason: "same_domain" });
    expect(out[1]).toEqual({ row: 91, kind: "keep", id: "ACC-003" });
  });

  it("matches by name when the domain is unknown", () => {
    const out = assignAccountIds([acc(2, "Inland Group", "unverified"), acc(3, "The Inland Group", "")]);
    expect(out[1]).toMatchObject({ kind: "duplicate", reason: "same_name" });
  });

  it("keeps different companies with different domains apart", () => {
    const out = assignAccountIds([acc(2, "Glencore", "glencore.com"), acc(3, "Glencore Canada", "glencore.ca")]);
    expect(out.map((o) => o.kind)).toEqual(["new", "new"]);
  });

  it("catches a copied ID", () => {
    const out = assignAccountIds([acc(2, "A", "a.com", "ACC-001"), acc(3, "B", "b.com", "ACC-001")]);
    expect(out[1]).toEqual({ row: 3, kind: "duplicate", duplicateOf: "ACC-001", reason: "same_id" });
  });

  it("skips blank rows", () => {
    expect(assignAccountIds([acc(2, "  ", "")])[0]).toEqual({ row: 2, kind: "skip", reason: "no_name" });
  });
});

describe("linkContact", () => {
  const index = buildAccountIndex([
    { id: "ACC-001", name: "BD (Becton Dickinson)", domain: "bd.com" },
    { id: "ACC-002", name: "Hilton", domain: "hilton.com" },
    { id: "ACC-003", name: "Learning Care Group", domain: "learningcaregroup.com" },
    { id: "ACC-004", name: "Schneider Electric", domain: "se.com" },
    { id: "ACC-005", name: "Amazon", domain: "amazon.com" },
    { id: "ACC-006", name: "Whole Foods Market", domain: "wholefoodsmarket.com" },
  ]);
  const c = (o: Partial<{ accountIdCell: string; company: string; email: string; companyDomain: string }>) => ({
    accountIdCell: "", company: "", email: "", companyDomain: "", ...o,
  });

  it("trusts an Account ID typed in the sheet over everything else", () => {
    expect(linkContact(c({ accountIdCell: "ACC-002", email: "x@bd.com" }), index)).toEqual({ accountId: "ACC-002", method: "account_id" });
  });

  it("ignores an Account ID that does not exist", () => {
    expect(linkContact(c({ accountIdCell: "ACC-999", email: "x@bd.com" }), index)).toEqual({ accountId: "ACC-001", method: "email_domain" });
  });

  it("links 'BD' contacts by email domain, including subdomains", () => {
    expect(linkContact(c({ company: "BD", email: "jane@bd.com" }), index)).toEqual({ accountId: "ACC-001", method: "email_domain" });
    expect(linkContact(c({ company: "BD", email: "jane@us.bd.com" }), index)).toMatchObject({ accountId: "ACC-001" });
  });

  it("links by company name when there is no work email", () => {
    expect(linkContact(c({ company: "Schneider Electric USA Inc.", companyDomain: "se.com" }), index)).toEqual({ accountId: "ACC-004", method: "company_name" });
    expect(linkContact(c({ company: "Learning Care" }), index)).toEqual({ accountId: "ACC-003", method: "company_name" });
  });

  it("uses the enrichment domain when the name loosely agrees", () => {
    expect(linkContact(c({ company: "Hilton Supply Management", companyDomain: "hilton.com" }), index)).toEqual({ accountId: "ACC-002", method: "company_domain" });
  });

  it("does not guess for a stray company", () => {
    expect(linkContact(c({ company: "Self Employed", email: "me@gmail.com" }), index)).toEqual({ accountId: null, reason: "no_match" });
  });

  it("sends a contact to review when name and enrichment domain disagree", () => {
    expect(linkContact(c({ company: "Amazon", companyDomain: "wholefoodsmarket.com" }), index)).toEqual({
      accountId: null,
      reason: "ambiguous",
      candidates: ["ACC-006", "ACC-005"],
    });
  });

  it("still trusts the work email over a disagreeing company name", () => {
    expect(linkContact(c({ company: "Amazon", email: "pat@wholefoodsmarket.com" }), index)).toEqual({ accountId: "ACC-006", method: "email_domain" });
  });

  it("ignores an enrichment domain when the company name says otherwise", () => {
    expect(linkContact(c({ company: "Self Employed", companyDomain: "bd.com" }), index)).toEqual({ accountId: null, reason: "no_match" });
    expect(linkContact(c({ company: "", companyDomain: "bd.com" }), index)).toEqual({ accountId: "ACC-001", method: "company_domain" });
  });

  it("does not match a lookalike domain", () => {
    expect(linkContact(c({ email: "x@notbd.com" }), index)).toEqual({ accountId: null, reason: "no_match" });
  });
});

describe("assignContactIds", () => {
  const con = (row: number, linkedinUrl: string, email = "", accountId: string | null = "ACC-001", idCell = "", fullName = `Contact ${"abcdefghijklmnopqrstuvwxyz"[row % 26]}son`) => ({
    row, idCell, fullName, email, linkedinUrl, accountId,
  });

  it("numbers contacts and continues after the highest existing ID", () => {
    const out = assignContactIds([con(2, "linkedin.com/in/a"), con(3, "linkedin.com/in/b", "", "ACC-001", "CON-0010")]);
    expect(out).toEqual([
      { row: 2, kind: "new", id: "CON-0011" },
      { row: 3, kind: "keep", id: "CON-0010" },
    ]);
  });

  it("flags the same person by LinkedIn URL, however it is written", () => {
    const out = assignContactIds([
      con(2, "https://www.linkedin.com/in/jane-doe"),
      con(3, "http://linkedin.com/in/Jane-Doe/"),
    ]);
    expect(out[1]).toEqual({ row: 3, kind: "duplicate", duplicateOf: "CON-0001", reason: "same_linkedin" });
  });

  it("flags the same person by email", () => {
    const out = assignContactIds([con(2, "", "jane@bd.com"), con(3, "", "JANE@bd.com ")]);
    expect(out[1]).toMatchObject({ kind: "duplicate", reason: "same_email" });
  });

  it("sends the same person under two accounts to review instead of merging", () => {
    const out = assignContactIds([
      con(2, "linkedin.com/in/jane", "", "ACC-002"),
      con(3, "linkedin.com/in/jane", "", "ACC-009"),
    ]);
    expect(out[1]).toEqual({ row: 3, kind: "conflict", id: "CON-0002", otherId: "CON-0001", reason: "same_person_two_accounts" });
  });

  it("treats one email on two clearly different people as an enrichment error, not a duplicate", () => {
    const out = assignContactIds([
      con(2, "linkedin.com/in/ckinrade", "cg@its.jnj.com", "ACC-001", "", "Catherine Gross"),
      con(3, "linkedin.com/in/celestetirro", "cg@its.jnj.com", "ACC-001", "", "Celeste Giraldi MBA PMP"),
    ]);
    expect(out[1]).toEqual({ row: 3, kind: "conflict", id: "CON-0002", otherId: "CON-0001", reason: "shared_email_different_people" });
  });

  it("still merges the same person with two LinkedIn profiles and one email", () => {
    const out = assignContactIds([
      con(2, "linkedin.com/in/morgan-phares-selor", "morgan.selor@clorox.com", "ACC-001", "", "Morgan Phares Selor"),
      con(3, "linkedin.com/in/morgan-selor-7687103a9", "morgan.selor@clorox.com", "ACC-001", "", "Morgan Selor"),
    ]);
    expect(out[1]).toMatchObject({ kind: "duplicate", duplicateOf: "CON-0001", reason: "same_email" });
  });

  it("keeps the named copy when a blank-name row is the same person", () => {
    const out = assignContactIds([
      con(2, "linkedin.com/in/thomas-“tom”-miller-a0690a2b", "", "ACC-001", "", ""),
      con(5, "https://www.linkedin.com/in/thomas-%E2%80%9Ctom%E2%80%9D-miller-a0690a2b", "", "ACC-001", "", "Thomas “Tom” Miller"),
    ]);
    expect(out[1]).toEqual({ row: 5, kind: "new", id: "CON-0001" });
    expect(out[0]).toMatchObject({ kind: "duplicate", duplicateOf: "CON-0001", reason: "same_linkedin" });
  });

  it("holds back the same name at the same account as a possible duplicate", () => {
    const out = assignContactIds([
      con(2, "linkedin.com/in/janet-fuentes-02214112", "janetfuentes@bd.coupahost.com", "ACC-019", "", "Janet Fuentes"),
      con(3, "linkedin.com/in/janet-fuentes-06b71b4", "", "ACC-019", "", "Janet Fuentes"),
    ]);
    expect(out[1]).toEqual({ row: 3, kind: "possible_duplicate", duplicateOf: "CON-0001", reason: "same_name_same_account" });
    expect(idCellValue(out[1])).toBe("POSSIBLE DUPLICATE of CON-0001");
  });

  it("gives an ID when a person types KEEP, and never asks again", () => {
    const first = assignContactIds([
      con(2, "linkedin.com/in/a", "", "ACC-019", "", "Janet Fuentes"),
      con(3, "linkedin.com/in/b", "", "ACC-019", "KEEP", "Janet Fuentes"),
    ]);
    expect(first[1]).toEqual({ row: 3, kind: "new", id: "CON-0002" });
    const next = assignContactIds([
      con(2, "linkedin.com/in/a", "", "ACC-019", "CON-0001", "Janet Fuentes"),
      con(3, "linkedin.com/in/b", "", "ACC-019", "CON-0002", "Janet Fuentes"),
    ]);
    expect(next.map((n) => n.kind)).toEqual(["keep", "keep"]);
  });

  it("does not treat the same name at different accounts as a duplicate", () => {
    const out = assignContactIds([
      con(2, "linkedin.com/in/a", "", "ACC-001", "", "Harry Peck"),
      con(3, "linkedin.com/in/b", "", "ACC-002", "", "Harry Peck"),
    ]);
    expect(out.map((o) => o.kind)).toEqual(["new", "new"]);
  });

  it("ignores credentials and nicknames when comparing names", () => {
    const out = assignContactIds([
      con(2, "linkedin.com/in/a", "", "ACC-001", "", "Thomas “Tom” Miller MBA"),
      con(3, "linkedin.com/in/b", "", "ACC-001", "", "Thomas Miller"),
    ]);
    expect(out[1]).toMatchObject({ kind: "possible_duplicate" });
  });

  it("never rewrites a correct existing ID", () => {
    const [a] = assignContactIds([con(2, "linkedin.com/in/a", "", "ACC-001", "CON-0005")]);
    expect(idCellValue(a)).toBeNull();
  });
});
