import { describe, expect, it } from "vitest";
import { openItems, type Facts } from "@/lib/checklist/items";

const facts = (o: Partial<Facts> = {}): Facts => ({ gmailOk: false, linkedinSeen: false, slackSet: false, signatureSet: false, isFounder: false, isAdmin: false, ...o });
const keys = (f: Facts, t: Record<string, string> = {}, now = new Date("2026-11-16T10:00:00Z")) => openItems(f, t, now).map((i) => i.key);

describe("setup checklist", () => {
  it("shows the common items to a new teammate and hides founder and admin items", () => {
    expect(keys(facts())).toEqual(["gmail", "linkedin_emails", "slack", "signature"]);
  });
  it("finishes items on its own when the app can see them", () => {
    expect(keys(facts({ gmailOk: true, linkedinSeen: true, slackSet: true, signatureSet: true }))).toEqual([]);
  });
  it("adds founder and admin items for those people", () => {
    expect(keys(facts({ gmailOk: true, linkedinSeen: true, slackSet: true, signatureSet: true, isFounder: true, isAdmin: true }))).toEqual(["founder_outreach", "backup"]);
  });
  it("a ticked item leaves the list, and the monthly backup comes back next month", () => {
    const f = facts({ gmailOk: true, linkedinSeen: true, slackSet: true, signatureSet: true, isAdmin: true });
    expect(keys(f, { backup: "2026-11-02T09:00:00Z" })).toEqual([]);
    expect(keys(f, { backup: "2026-10-30T09:00:00Z" })).toEqual(["backup"]);
    expect(keys(facts(), { linkedin_emails: "2026-11-01T00:00:00Z" })).not.toContain("linkedin_emails");
  });
});
