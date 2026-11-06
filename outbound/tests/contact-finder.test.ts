import { describe, expect, it } from "vitest";
import { contactRows, nextContactNumber } from "@/lib/contacts/sheet-row";

// The real Contacts tab header (Wiza + Evaboot export), plus the two ID columns.
const HEADER = ["Full Name", "Title", "Company", "LinkedIn URL", "Found In", "Best Email", "Best Email Source", "Best Email Status", "Email Conflict (Wiza vs Evaboot differ)", "Best Phone (Wiza)", "Location", "Mouli Account", "Mouli Tier", "Account ID", "Contact ID"];
const person = { full_name: "Dana Ruiz", title: "Director, Procurement Operations", linkedin_url: "https://www.linkedin.com/in/dana-ruiz", location: "Rye Brook, NY", source_url: "https://example.com/team", evidence: "Leads source-to-pay at Xylem" };

describe("adding found contacts to the sheet", () => {
  it("continues Contact IDs after the highest one, ignoring notes and blanks", () => {
    expect(nextContactNumber(["CON-0001", "CON-0549", "", "DUPLICATE of CON-0087", "KEEP"])).toBe(550);
    expect(nextContactNumber([])).toBe(1);
  });

  it("fills only what was found, in the right columns, with both IDs", () => {
    const [row] = contactRows(HEADER, ["CON-0549"], [person], { sheetAccountId: "ACC-012", name: "Xylem" });
    const at = (h: string) => row[HEADER.indexOf(h)];
    expect(row).toHaveLength(HEADER.length);
    expect([at("Full Name"), at("Title"), at("Company"), at("LinkedIn URL"), at("Location")]).toEqual(["Dana Ruiz", "Director, Procurement Operations", "Xylem", "https://www.linkedin.com/in/dana-ruiz", "Rye Brook, NY"]);
    expect(at("Found In")).toBe("Claude web search (verify on LinkedIn)");
    expect([at("Account ID"), at("Contact ID")]).toEqual(["ACC-012", "CON-0550"]);
  });

  it("never writes an email or a phone number", () => {
    const [row] = contactRows(HEADER, [], [person], { sheetAccountId: "ACC-012", name: "Xylem" });
    for (const h of ["Best Email", "Best Email Source", "Best Email Status", "Best Phone (Wiza)"]) expect(row[HEADER.indexOf(h)]).toBe("");
  });

  it("numbers several people in a row", () => {
    const rows = contactRows(HEADER, ["CON-0010"], [person, { ...person, full_name: "Sam Lee", linkedin_url: "https://www.linkedin.com/in/sam-lee" }], { sheetAccountId: "ACC-012", name: "Xylem" });
    expect(rows.map((r) => r[HEADER.indexOf("Contact ID")])).toEqual(["CON-0011", "CON-0012"]);
  });

  it("refuses a sheet without the ID columns", () => {
    expect(() => contactRows(HEADER.slice(0, 13), [], [person], { sheetAccountId: "ACC-012", name: "Xylem" })).toThrow(/Account ID and Contact ID/);
  });
});
