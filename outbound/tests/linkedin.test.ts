import { describe, expect, it } from "vitest";
import { headlineFrom, htmlToText, matchContact, parseLinkedIn, senderName, type Candidate } from "@/lib/linkedin/parse";

const inv = (o = {}) => ({ fromAddress: "invitations@linkedin.com", fromDisplay: "Ricky Wallis via LinkedIn", subject: "Ricky accepted your invitation, explore their network", text: "See Ricky Wallis's connections\nRicky has accepted your invitation\nRicky Wallis\nContracts Manager at SSE plc\nMessage", ...o });
const cand = (id: string, fullName: string, accountName: string): Candidate => ({ id, accountId: `a-${id}`, accountName, fullName, title: null });

describe("LinkedIn notices", () => {
  it("reads an acceptance with the person's name and headline", () => {
    expect(parseLinkedIn(inv())).toEqual({ kind: "accepted", name: "Ricky Wallis", headline: "Contracts Manager at SSE plc" });
  });
  it("ignores invitations that are not acceptances", () => {
    expect(parseLinkedIn(inv({ subject: "I want to connect" }))).toBeNull();
    expect(parseLinkedIn(inv({ fromAddress: "editors-noreply@linkedin.com" }))).toBeNull();
  });
  it("reads message notices and InMail replies, and skips post noise", () => {
    expect(parseLinkedIn({ fromAddress: "messages-noreply@linkedin.com", fromDisplay: "LinkedIn", subject: "Sandeep Prabhu sent you a message 3 days ago", text: "" })).toMatchObject({ kind: "message", name: "Sandeep Prabhu" });
    const m = parseLinkedIn({ fromAddress: "hit-reply@linkedin.com", fromDisplay: "Mark M.", subject: "Message replied from Mark M.", text: "You have a new InMail message.\n\nGreat! Glad you got your passport.\n\nView in Sales Navigator\nhttps://x" });
    expect(m).toEqual({ kind: "message", name: "Mark M.", text: "Great! Glad you got your passport." });
    expect(parseLinkedIn({ fromAddress: "messages-noreply@linkedin.com", fromDisplay: "LinkedIn", subject: "Brent McClure commented on your post.", text: "" })).toBeNull();
    expect(parseLinkedIn({ fromAddress: "messages-noreply@linkedin.com", fromDisplay: "LinkedIn Sales Navigator", subject: "Nick Williams shared a post", text: "" })).toBeNull();
  });
  it("cleans the sender name and the visible text", () => {
    expect(senderName("Renjith Jose via LinkedIn")).toBe("Renjith Jose");
    expect(htmlToText("<style>a{}</style><p>Ricky&nbsp;Wallis</p><p>Role at Co</p>")).toBe("Ricky Wallis\nRole at Co");
    expect(headlineFrom("x\nRicky Wallis\nMessage", "Ricky Wallis")).toBeNull();
  });
});

describe("matching a notice to a contact", () => {
  const list = [cand("1", "Ricky Wallis", "SSE plc"), cand("2", "Nancy Tiran", "AbbVie"), cand("3", "Mark Mitchell", "Stryker")];
  it("matches a full name exactly, ignoring case and accents", () => {
    expect(matchContact("ricky wallis", null, list)).toMatchObject({ kind: "match" });
    expect(matchContact("Nancy Tirán", null, list)).toMatchObject({ kind: "match", candidate: { id: "2" } });
  });
  it("drops credentials after a comma and matches an initial", () => {
    expect(matchContact("Ricky Wallis, ACMA, PMP", null, list)).toMatchObject({ kind: "match", candidate: { id: "1" } });
    expect(matchContact("Mark M.", null, list)).toMatchObject({ kind: "match", candidate: { id: "3" } });
  });
  it("ignores credentials on either side when matching an initial", () => {
    const l = [cand("1", "Tyler Reid", "Centene"), cand("2", "Tyler Richardson MBA", "Centene")];
    expect(matchContact("Tyler R.", null, l)).toMatchObject({ kind: "ambiguous" });
    expect(matchContact("Tyler Richardson", null, l)).toMatchObject({ kind: "match", candidate: { id: "2" } });
  });
  it("never matches a first name alone or someone not in a campaign", () => {
    expect(matchContact("Ricky", null, list)).toEqual({ kind: "none" });
    expect(matchContact("Sam Jones", null, list)).toEqual({ kind: "none" });
  });
  it("uses the company in the headline to split two people with the same name, else refuses to guess", () => {
    const two = [cand("1", "Chris Lee", "AbbVie"), cand("2", "Chris Lee", "Stryker")];
    expect(matchContact("Chris Lee", "VP Procurement at Stryker", two)).toMatchObject({ kind: "match", candidate: { id: "2" } });
    expect(matchContact("Chris Lee", "Director at Other Co", two)).toMatchObject({ kind: "ambiguous" });
    expect(matchContact("Chris Lee", null, two)).toMatchObject({ kind: "ambiguous" });
  });
});
