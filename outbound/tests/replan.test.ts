import { describe, expect, it } from "vitest";
import { blockedContacts, splitFindings } from "@/lib/responses/findings";
import { diffPlans, type PlanStep } from "@/lib/responses/diff";

const step = (o: Partial<PlanStep> = {}): PlanStep => ({ contactId: "c1", sequenceNo: 1, channel: "email", date: "2026-11-18", offset: null, subject: "Supplier paper", body: "Hi Dan,\n\nA point.\n\nRajiv\nCo-founder, Spendflo", ...o });

describe("Claude's notes never block a re-plan", () => {
  const notes = [
    { text: "ICP: revenue of about 54B is above the B band; confirm the profile before launch." },
    { text: "No VP Procurement or CPO is in contacts; add one if a director points up." },
    { text: "The A3 playbook was not in this request; check the copy against it." },
    { text: "New CFO announced 2026-11-06 is not a counted signal and no CFO is in contacts." },
  ];
  it("treats advice as advice", () => {
    const r = splitFindings(notes);
    expect(r.errors).toEqual([]);
    expect(r.advice).toHaveLength(4);
    expect(blockedContacts(r.errors).wholePlan).toBe(false);
  });
  it("blocks only the contact whose step is broken", () => {
    const r = splitFindings([...notes, { text: "Step 2 is email but this contact has no email.", contactId: "c2", sequenceNo: 2 }, { text: "Step 1 has no usable date and was left out.", contactId: "c3", sequenceNo: 1 }]);
    expect(r.errors).toHaveLength(2);
    const b = blockedContacts(r.errors);
    expect([...b.contacts].sort()).toEqual(["c2", "c3"]);
    expect(b.wholePlan).toBe(false);
  });
  it("stops the whole plan when there is nothing to apply", () => {
    const b = blockedContacts(splitFindings([{ text: "The plan has no usable tracks. Regenerate or add tracks by hand." }]).errors);
    expect(b.wholePlan).toBe(true);
  });
  it("counts the real problems as errors", () => {
    for (const t of ["Step 1 has an unresolved placeholder like {first_name}.", "Step 3 is a LinkedIn message before any connect request.", "Step 2 has no copy.", "Step 2 claims a connection or past conversation the data does not show.", "Step 1 uses the channel Other, which the app cannot send. Use email, LinkedIn or a call.", "Step 1 connect note is 340 characters (max 300)."]) {
      expect(splitFindings([{ text: t, contactId: "c1" }]).errors).toHaveLength(1);
    }
  });
  it("leaves style notes as advice", () => {
    for (const t of ["Step 2 contains an em dash.", "Step 1 email is 172 words (flag above 150)."]) expect(splitFindings([{ text: t, contactId: "c1" }]).advice).toHaveLength(1);
  });
});

describe("the comparison shows real changes only", () => {
  it("keeps a step whose text differs only in spacing", () => {
    const r = diffPlans([step()], [step({ body: "Hi Dan,\n\n\nA point.\n\nRajiv\nCo-founder, Spendflo" })]);
    expect(r[0].kind).toBe("kept");
  });
  it("ignores a one-day date nudge on an otherwise identical step", () => {
    expect(diffPlans([step()], [step({ date: "2026-11-19" })])[0].kind).toBe("kept");
    expect(diffPlans([step()], [step({ date: "2026-11-17" })])[0].kind).toBe("kept");
  });
  it("still reports a real date move", () => {
    const r = diffPlans([step()], [step({ date: "2026-11-25" })])[0];
    expect(r.kind).toBe("changed");
    if (r.kind === "changed") expect(r.what).toEqual(["date"]);
  });
  it("reports a changed channel, subject and copy", () => {
    const r = diffPlans([step()], [step({ channel: "linkedin_message", subject: null, body: "Quick question on renewals?" })])[0];
    if (r.kind !== "changed") throw new Error("expected changed");
    expect(r.what).toEqual(["channel", "subject", "copy"]);
  });
  it("does not hide a date move when something else changed too", () => {
    const r = diffPlans([step()], [step({ date: "2026-11-19", body: "Different text." })])[0];
    if (r.kind !== "changed") throw new Error("expected changed");
    expect(r.what).toEqual(["copy"]);
  });
});
