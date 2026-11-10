import { describe, expect, it } from "vitest";
import { emailChecks, finalizeEmail, firstNameOf, writingForPayload, type WritingRules } from "@/lib/writing/compose";

const sig = "Rajiv\nCo-founder, Spendflo";

describe("finished emails", () => {
  it("adds the greeting and the signature", () => {
    const out = finalizeEmail("Suppliers bring their own paper.\n\nHow does a draft get its first review today?", { firstName: "Dan", signature: sig });
    expect(out).toBe("Hi Dan,\n\nSuppliers bring their own paper.\n\nHow does a draft get its first review today?\n\nRajiv\nCo-founder, Spendflo");
  });
  it("does not double a greeting or a sign-off Claude wrote", () => {
    const once = finalizeEmail("Hi Dan,\n\nA short note.\n\nBest,\nRajiv", { firstName: "Dan", signature: sig });
    expect(once).toBe("Hi Dan,\n\nA short note.\n\nRajiv\nCo-founder, Spendflo");
    expect(finalizeEmail(once, { firstName: "Dan", signature: sig })).toBe(once);
  });
  it("breaks one block of text into short paragraphs and keeps the question last", () => {
    const out = finalizeEmail("First point here. Second point here. Third point here. Fourth point here. How do you handle this today?", { firstName: "Dan", signature: sig });
    const paras = out.split("\n\n");
    expect(paras.length).toBeGreaterThanOrEqual(4);
    expect(paras[paras.length - 2]).toBe("How do you handle this today?");
  });
  it("removes em dashes", () => {
    expect(finalizeEmail("Fast — and clear.", { firstName: null, signature: null })).toBe("Fast, and clear.");
  });
  it("works without a known first name or signature", () => {
    expect(finalizeEmail("Just the note.", { firstName: null, signature: null })).toBe("Just the note.");
  });
  it("reads first names from full names", () => {
    expect(firstNameOf("Dan Herman")).toBe("Dan");
    expect(firstNameOf("  ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe("writing rules for one campaign", () => {
  const rules: WritingRules = {
    team: "Plain English.",
    personas: { economic_buyer: "Lead with spend under control.", champion: "Ask who owns the job.", legal: "" },
    senders: { u1: { voice: "Founder and operator.", signature: sig }, u2: { voice: "", signature: "Sid" } },
  };
  it("sends only the personas on the account, and only those with instructions", () => {
    const w = writingForPayload(rules, "u1", "Rajiv", ["economic_buyer", "legal", "economic_buyer", null]);
    expect(w).toEqual({ team: "Plain English.", sender: { name: "Rajiv", voice: "Founder and operator." }, personas: { economic_buyer: "Lead with spend under control." } });
  });
  it("falls back to the team rules when the sender has no voice", () => {
    const w = writingForPayload(rules, "u2", "Sid", []);
    expect(w?.sender.voice).toBeUndefined();
    expect(w?.team).toBe("Plain English.");
    expect(w?.personas).toBeUndefined();
  });
  it("sends nothing when there are no rules at all", () => {
    expect(writingForPayload({ team: "", personas: {}, senders: {} }, null, "Rajiv", ["champion"])).toBeNull();
  });
  it("never puts the signature in front of Claude", () => {
    expect(JSON.stringify(writingForPayload(rules, "u1", "Rajiv", []))).not.toContain("Co-founder");
  });
});

describe("email checks", () => {
  it("warns on length, em dashes and subject length, and never blocks", () => {
    expect(emailChecks("Quick", "word ".repeat(130))).toEqual(expect.arrayContaining([expect.stringMatching(/130 words/), expect.stringMatching(/subject is 1 word/)]));
    expect(emailChecks("Supplier paper at BD", "Short and clear.")).toEqual([]);
  });
});
