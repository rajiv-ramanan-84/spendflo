import { describe, expect, it } from "vitest";
import { buildHeaderIndex, columnLetter, MASTER_FIELDS } from "@/lib/sheet-sync/headers";
import { countryFromLocation, guessPersona, parseSheetDate, parseVerdict } from "@/lib/sheet-sync/parse";
import { planSync, type SyncSnapshot } from "@/lib/sheet-sync/plan";
import { assertContactWritesAllowed, assertMasterWritesAllowed, planWriteback } from "@/lib/sheet-sync/writeback";

// Headers as they appear in the real Coupa_Account_Book (subset + app columns).
const MASTER_HDR = ["Company", "Owner", "Tier", "Status", "ICP Verdict", "Domain", "HQ", "Revenue (~)", "Coupa Evidence", "Trigger / Why Now", "Why (Fit)", "Disqualifier Flags", "Last Touch", "Next Step Date", "Contacts Engaged", "Account ID"];
const CONTACT_HDR = ["Full Name", "Title", "Company", "LinkedIn URL", "Best Email", "Best Email Status", "Best Phone (Wiza)", "Wiza company_domain", "Location", "Evaboot Has New Position", "Contact ID", "Account ID"];

const m = (company: string, owner: string, tier: string, verdict: string, domain: string, id = "", why = "") =>
  [company, owner, tier, "", verdict, domain, "Atlanta, GA", "~$1B", "Coupa admin on LinkedIn", "M&A alert", why, "", "", "", "", id];
const c = (name: string, title: string, company: string, li: string, email: string, id = "", acct = "", loc = "Atlanta, Georgia, United States") =>
  [name, title, company, li, email, email ? "valid" : "", "+1 555 0100", "", loc, "Yes", id, acct];

function snap(over: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    accounts: new Map(),
    contacts: new Map(),
    dncEmails: new Set(),
    dncLinkedIns: new Set(),
    usersByName: new Map([["rajiv", "u-rajiv"], ["sid", "u-sid"], ["mouli", "u-mouli"], ["shweta", "u-shweta"]]),
    ...over,
  };
}

const MASTER = [
  MASTER_HDR,
  m("Cortland", "Mouli", "A", "FIT", "cortland.com", "", "Coupa build-out"),
  m("GameStop", "Mouli", "A", "FIT", "gamestop.com"),
  m("Ally", "Rajiv", "C", "MAYBE", "ally.com"),
  m("Amazon", "Sid", "D", "NO-FIT", "amazon.com"),
  m("GAMESTOP INC", "Mouli", "D", "NO-FIT", "gamestop.com"),
  m("The Clorox Company", "Mouli", "D", "FIT", "thecloroxcompany.com"),
];
const CONTACTS = [
  CONTACT_HDR,
  c("Priya Shah", "Head of Procurement", "Cortland", "https://linkedin.com/in/priya", "priya@cortland.com"),
  c("Sam Lee", "Coupa System Administrator", "Cortland", "https://linkedin.com/in/sam", ""),
  c("Old Timer", "Retired", "Cortland", "https://linkedin.com/in/old", "old@cortland.com"),
  c("Self Person", "Consultant", "Self Employed", "https://linkedin.com/in/self", "me@gmail.com"),
  c("Odd Email", "Buyer", "Ally", "https://linkedin.com/in/odd", "odd@otherco.com"),
  c("Priya Shah", "Head of Procurement", "Cortland", "https://www.linkedin.com/in/Priya/", "priya@cortland.com"),
  c("Nobody", "Buyer", "Ally", "", ""),
];

describe("parsing", () => {
  it("maps real headers by name, not position", () => {
    const idx = buildHeaderIndex(MASTER_HDR, MASTER_FIELDS);
    expect(idx.col.name).toBe(0);
    expect(idx.col.revenue).toBe(7);
    expect(idx.col.trigger).toBe(9);
    expect(idx.col.sheet_account_id).toBe(15);
    expect(idx.extra.map((e) => e.header)).toEqual(["Why (Fit)"]);
  });

  it("parses verdicts, dates, countries and column letters", () => {
    expect(parseVerdict("NO-FIT")).toBe("no_fit");
    expect(parseVerdict("maybe")).toBe("maybe");
    expect(parseVerdict("??")).toBeNull();
    expect(parseSheetDate("10/20/2026")).toBe("2026-10-20");
    expect(countryFromLocation("Philadelphia, Pennsylvania, United States")).toBe("US");
    expect(countryFromLocation("Toronto, Ontario, Canada")).toBe("CA");
    expect(countryFromLocation("Somewhere")).toBeNull();
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(31)).toBe("AF");
    expect(columnLetter(38)).toBe("AM");
  });

  it("guesses a persona from the title for Mouli to review", () => {
    expect(guessPersona("Coupa System Administrator")).toBe("system_owner");
    expect(guessPersona("Chief Financial Officer")).toBe("economic_buyer");
    expect(guessPersona("VP Procurement")).toBe("procurement_leader");
    expect(guessPersona("Director, Strategic Sourcing")).toBe("procurement_leader");
    expect(guessPersona("Senior Contract Manager")).toBe("contract_manager");
    expect(guessPersona("Associate General Counsel")).toBe("legal");
    expect(guessPersona("Accounts Payable Manager")).toBe("finance_ap");
    expect(guessPersona("Chief of Staff to the CEO")).toBe("champion");
  });
});

describe("planSync on a fresh database", () => {
  const plan = planSync(MASTER, CONTACTS, snap());

  it("imports FIT and MAYBE as active, NO-FIT as archived, and skips the duplicate", () => {
    expect(plan.ok).toBe(true);
    const byName = Object.fromEntries(plan.accounts.map((a) => [a.fields.name, a]));
    expect(byName["Cortland"].archived).toBe(false);
    expect(byName["Ally"].archived).toBe(false);
    expect(byName["Amazon"].archived).toBe(true);
    expect(byName["GAMESTOP INC"]).toBeUndefined();
    expect(plan.counts).toMatchObject({ masterRows: 6, accountsActive: 4, accountsArchived: 1, accountsNotImported: 1 });
  });

  it("sets the owner from the sheet on first import", () => {
    expect(plan.accounts.find((a) => a.fields.name === "Cortland")!.ownerId).toBe("u-mouli");
  });

  it("keeps unmapped columns as custom fields for Claude", () => {
    expect(plan.accounts.find((a) => a.fields.name === "Cortland")!.custom_fields).toEqual({ "Why (Fit)": "Coupa build-out" });
  });

  it("writes Account IDs and labels the duplicate in the sheet", () => {
    const masterWrites = plan.sheetWrites.filter((w) => w.tab === "master").map((w) => [w.row, w.value]);
    expect(masterWrites).toContainEqual([2, "ACC-001"]);
    expect(masterWrites).toContainEqual([6, "DUPLICATE of ACC-002"]);
  });

  it("flags Tier D with FIT for review", () => {
    expect(plan.dq.some((d) => d.type === "verdict_tier_mismatch" && d.row === 7)).toBe(true);
  });

  it("imports good contacts and routes the rest to the review queue", () => {
    expect(plan.contacts.map((x) => x.fields.full_name).sort()).toEqual(["Priya Shah", "Sam Lee"]);
    const types = plan.dq.filter((d) => d.tab === "contacts").map((d) => d.type).sort();
    expect(types).toEqual(["duplicate_contact", "email_domain_mismatch", "no_email_no_linkedin", "retired_title", "unlinked_contact"].sort());
  });

  it("parses country and LinkedIn signals but never treats phone as a signal", () => {
    const priya = plan.contacts.find((x) => x.fields.full_name === "Priya Shah")!;
    expect(priya.fields.country).toBe("US");
    expect(priya.linkedin_signals).toEqual({ has_new_position: "Yes" });
  });

  it("auto-drafts only new, active Tier A or B accounts with an owner and a usable contact", () => {
    expect(plan.autoDraft).toEqual(["ACC-001"]); // Cortland; GameStop has no contacts
  });
});

describe("planSync against an existing database", () => {
  it("does not change the owner after first import, but shows a hint", () => {
    const plan = planSync(MASTER, CONTACTS, snap({ accounts: new Map([["ACC-001", { id: "a1", ownerId: "u-rajiv", sheetDeleted: false }]]) }));
    const cortland = plan.accounts.find((a) => a.sheetAccountId === "ACC-001")!;
    expect(cortland.isNew).toBe(false);
    expect(cortland.ownerId).toBeNull();
    expect(cortland.sheetOwnerHint).toBe("Mouli");
  });

  it("flags rows deleted from the sheet instead of deleting them", () => {
    const plan = planSync(MASTER, CONTACTS, snap({ accounts: new Map([["ACC-099", { id: "x", ownerId: null, sheetDeleted: false }]]) }));
    expect(plan.flagDeletedAccounts).toEqual(["ACC-099"]);
  });

  it("keeps do-not-contact on a person even if the sheet is re-imported", () => {
    const plan = planSync(MASTER, CONTACTS, snap({ dncEmails: new Set(["priya@cortland.com"]) }));
    expect(plan.contacts.find((x) => x.fields.full_name === "Priya Shah")!.doNotContact).toBe(true);
  });

  it("marks a contact changed when the title changes mid-campaign", () => {
    const first = planSync(MASTER, CONTACTS, snap());
    const priyaKey = first.contacts.find((x) => x.fields.full_name === "Priya Shah")!.sheetContactKey;
    const plan = planSync(MASTER, CONTACTS, snap({ contacts: new Map([[priyaKey, { id: "c1", title: "Director of Procurement", accountSheetId: "ACC-001", sheetDeleted: false }]]) }));
    expect(plan.contacts.find((x) => x.sheetContactKey === priyaKey)!.changed).toBe(true);
  });

  it("is idempotent: a second sync over the written sheet writes no ID cells", () => {
    const first = planSync(MASTER, CONTACTS, snap());
    const apply = (sheet: string[][], tab: "master" | "contacts") => {
      const copy = sheet.map((r) => [...r]);
      for (const w of first.sheetWrites.filter((x) => x.tab === tab)) copy[w.row - 1][w.col] = w.value;
      return copy;
    };
    const second = planSync(apply(MASTER, "master"), apply(CONTACTS, "contacts"), snap());
    expect(second.sheetWrites).toEqual([]);
    expect(second.accounts.map((a) => a.sheetAccountId)).toEqual(first.accounts.map((a) => a.sheetAccountId));
  });

  it("trusts an Account ID typed by a person over an email domain mismatch", () => {
    const contacts = [CONTACT_HDR, c("Odd Email", "Buyer", "Ally", "https://linkedin.com/in/odd", "odd@otherco.com", "", "ACC-003")];
    const plan = planSync(MASTER, contacts, snap());
    expect(plan.contacts.map((x) => x.accountSheetId)).toEqual(["ACC-003"]);
  });

  it("refuses to run when a required column is missing", () => {
    const plan = planSync([MASTER_HDR.filter((h) => h !== "Account ID"), ...MASTER.slice(1)], CONTACTS, snap());
    expect(plan.ok).toBe(false);
    expect(plan.fatal[0]).toMatch(/Account ID/i);
  });
});

describe("write-back", () => {
  const sheet = [MASTER_HDR, m("Cortland", "Mouli", "A", "FIT", "cortland.com", "ACC-001"), m("Ally", "Rajiv", "C", "MAYBE", "ally.com", "ACC-002")];

  it("writes only the four status columns, and only cells that changed", () => {
    const { writes, missingColumns } = planWriteback(
      sheet,
      new Map([["ACC-001", { campaignStatus: "active" as const, lastTouch: "2026-11-05", nextStepDate: "2026-11-10", contactsEngaged: 2, contactsTotal: 6 }]]),
    );
    expect(missingColumns).toEqual([]);
    expect(writes.map((w) => [MASTER_HDR[w.col], w.value])).toEqual([
      ["Status", "Active"],
      ["Last Touch", "2026-11-05"],
      ["Next Step Date", "2026-11-10"],
      ["Contacts Engaged", "2 of 6"],
    ]);
    expect(() => assertMasterWritesAllowed(sheet, writes)).not.toThrow();
  });

  it("writes nothing when the sheet already matches", () => {
    const synced = sheet.map((r) => [...r]);
    synced[1][3] = "Not started";
    const { writes } = planWriteback(synced, new Map([["ACC-001", { campaignStatus: null, lastTouch: null, nextStepDate: null, contactsEngaged: 0, contactsTotal: 0 }]]));
    expect(writes).toEqual([]);
  });

  it("reports missing write-back columns instead of creating them", () => {
    const noCols = [MASTER_HDR.filter((h) => !["Last Touch", "Next Step Date", "Contacts Engaged"].includes(h))];
    expect(planWriteback(noCols, new Map()).missingColumns).toEqual(["last touch", "next step date", "contacts engaged"]);
  });

  it("refuses any write outside the app-owned columns", () => {
    expect(() => assertMasterWritesAllowed(sheet, [{ tab: "master", row: 2, col: 0, value: "oops" }])).toThrow(/Refusing/);
    expect(() => assertContactWritesAllowed([CONTACT_HDR], [{ tab: "contacts", row: 2, col: 1, value: "oops" }])).toThrow(/Refusing/);
    expect(() => assertContactWritesAllowed([CONTACT_HDR], [{ tab: "contacts", row: 2, col: 10, value: "CON-0001" }])).not.toThrow();
  });

  it("every write a full plan produces passes the guards", () => {
    const plan = planSync(MASTER, CONTACTS, snap());
    expect(() => assertMasterWritesAllowed(MASTER, plan.sheetWrites)).not.toThrow();
    expect(() => assertContactWritesAllowed(CONTACTS, plan.sheetWrites)).not.toThrow();
  });
});
