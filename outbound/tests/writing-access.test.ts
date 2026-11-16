import { describe, expect, it } from "vitest";
import { canEditRule } from "@/lib/writing/access";
import { EMPTY_RULES, senderRuleFor, writingForPayload } from "@/lib/writing/compose";

const base = { userId: "u-mouli", key: "x", runsMailbox: false };
describe("who may change a writing rule", () => {
  it("lets admins change anything", () => {
    for (const scope of ["team", "persona", "sender", "mailbox"] as const) expect(canEditRule({ ...base, role: "admin", scope })).toBe(true);
  });
  it("lets managers change team and persona rules but not other people's voice", () => {
    expect(canEditRule({ ...base, role: "manager", scope: "team" })).toBe(true);
    expect(canEditRule({ ...base, role: "manager", scope: "persona" })).toBe(true);
    expect(canEditRule({ ...base, role: "manager", scope: "sender", key: "u-sid" })).toBe(false);
  });
  it("lets anyone change their own voice and signature, and only theirs", () => {
    expect(canEditRule({ ...base, role: "member", scope: "sender", key: "u-mouli" })).toBe(true);
    expect(canEditRule({ ...base, role: "member", scope: "sender", key: "u-sid" })).toBe(false);
    expect(canEditRule({ ...base, role: "member", scope: "team" })).toBe(false);
  });
  it("lets the people who run a mailbox change that mailbox only", () => {
    expect(canEditRule({ ...base, role: "manager", scope: "mailbox", runsMailbox: true })).toBe(true);
    expect(canEditRule({ ...base, role: "manager", scope: "mailbox", runsMailbox: false })).toBe(false);
  });
});

describe("a mailbox's own rules", () => {
  const rules = { ...EMPTY_RULES, senders: { sid: { voice: "Sid voice", signature: "Sid\nCo-founder" } }, mailboxes: { "sid-box": { voice: "", signature: "Sid (via Mouli)\nSpendflo" }, "other-box": { voice: "Other voice", signature: "" } } };
  it("overrides the person's signature and falls back for what is blank", () => {
    expect(senderRuleFor(rules, { senderId: "sid", mailboxId: "sid-box" })).toEqual({ voice: "Sid voice", signature: "Sid (via Mouli)\nSpendflo" });
    expect(senderRuleFor(rules, { senderId: "sid", mailboxId: "other-box" })).toEqual({ voice: "Other voice", signature: "Sid\nCo-founder" });
  });
  it("uses the person's own rules when the mailbox has none", () => {
    expect(senderRuleFor(rules, { senderId: "sid", mailboxId: "none" })).toEqual({ voice: "Sid voice", signature: "Sid\nCo-founder" });
    expect(senderRuleFor(rules, { senderId: "sid" }).voice).toBe("Sid voice");
  });
  it("tells Claude the mailbox's voice for that send", () => {
    expect(writingForPayload(rules, "sid", "Sid", [], "other-box")?.sender.voice).toBe("Other voice");
    expect(writingForPayload(rules, "sid", "Sid", [])?.sender.voice).toBe("Sid voice");
  });
});
