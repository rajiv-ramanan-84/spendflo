import { describe, expect, it } from "vitest";
import { effectOf, needsReview, shiftPastReturn, switchEmailsToLinkedIn } from "@/lib/responses/rules";
import { addressOf, bodyText, bouncedAddress, isBounce, matchSender, stripQuoted } from "@/lib/responses/parse";
import { diffPlans, diffSummary } from "@/lib/responses/diff";
import { prospectHolidayLookup } from "@/lib/calendar/holidays";

const ctx = { prospectHolidays: prospectHolidayLookup([2026, 2027]), teamHolidays: new Set<string>(), outOfOffice: new Map(), quietPeriods: [] };
const b64 = (s: string) => Buffer.from(s).toString("base64url");

describe("what a confirmed response does", () => {
  it("positive: replied, track paused as replied, asks about other tracks, starts CFO-style triggers", () => {
    expect(effectOf("positive")).toMatchObject({ contactEngagement: "replied", trackStatus: "replied", askPauseOthers: true, startReplyTriggers: true, needsReplan: true, campaignStatus: "responded" });
  });
  it("objection and not now pause the track and ask for a re-plan", () => {
    expect(effectOf("objection")).toMatchObject({ trackStatus: "paused", needsReplan: true, doNotContact: false });
    expect(effectOf("not_now")).toMatchObject({ trackStatus: "paused", needsReplan: true });
  });
  it("unsubscribe and wrong person stop the track and set do-not-contact", () => {
    for (const c of ["unsubscribe", "wrong_person"] as const) {
      expect(effectOf(c)).toMatchObject({ trackStatus: "stopped", doNotContact: true, needsReplan: false, startReplyTriggers: false, contactEngagement: "stopped" });
    }
  });
  it("auto-replies and bounces are not replies", () => {
    expect(effectOf("auto_reply")).toMatchObject({ countsAsReply: false, shiftForReturnDate: true, trackStatus: null });
    expect(effectOf("bounce")).toMatchObject({ countsAsReply: false, bounced: true, trackStatus: null });
  });
  it("shows anything under 0.7 confidence as Needs review", () => {
    expect(needsReview(0.69)).toBe(true);
    expect(needsReview(0.7)).toBe(false);
    expect(needsReview(null)).toBe(true);
  });
});

describe("out of office", () => {
  it("moves open steps to the first working day after the return date, keeping gaps", () => {
    const r = shiftPastReturn([{ id: "a", date: "2026-11-10" }, { id: "b", date: "2026-11-12" }, { id: "c", date: "2026-12-10" }], "2026-11-25", {}, ctx);
    expect(r.map((x) => x.date)).toEqual(["2026-11-27", "2026-12-01", "2026-12-10"]); // 26 Nov is Thanksgiving
    expect(r[2].movedFrom).toBeNull();
  });
});

describe("bounce", () => {
  it("switches email steps to LinkedIn: connect first, then messages", () => {
    const r = switchEmailsToLinkedIn([{ id: "e2", channel: "email", date: "2026-11-12" }, { id: "c", channel: "call", date: "2026-11-11" }, { id: "e1", channel: "email", date: "2026-11-10" }], false);
    expect(r).toEqual([{ id: "e1", channel: "linkedin_connect" }, { id: "e2", channel: "linkedin_message" }]);
    expect(switchEmailsToLinkedIn([{ id: "e1", channel: "email", date: "2026-11-10" }], true)).toEqual([{ id: "e1", channel: "linkedin_message" }]);
  });

  it("detects bounce notices and the bounced address", () => {
    expect(isBounce("Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "Delivery Status Notification (Failure)", undefined)).toBe(true);
    expect(isBounce("Patrick <p@x.com>", "Re: renewals", { mimeType: "multipart/report", parts: [{ mimeType: "message/delivery-status" }] })).toBe(true);
    expect(isBounce("Patrick <p@x.com>", "Re: renewals", { mimeType: "text/plain" })).toBe(false);
    expect(bouncedAddress("Address not found: Patrick.V@adusa.com could not be delivered", ["patrick.v@adusa.com", "jason@adusa.com"])).toBe("patrick.v@adusa.com");
  });
});

describe("reading replies", () => {
  it("prefers text/plain, falls back to stripped HTML", () => {
    const multipart = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: b64("<p>Hi <b>there</b></p>") } }, { mimeType: "text/plain", body: { data: b64("Hi there") } }] };
    expect(bodyText(multipart)).toBe("Hi there");
    expect(bodyText({ mimeType: "text/html", body: { data: b64("<div>Yes &amp; thanks<br>Pat</div><style>x{}</style>") } }).trim()).toBe("Yes & thanks\nPat");
  });

  it("keeps only the new text of a reply", () => {
    const t = "Sounds good, Thursday works.\n\nPatrick\n\nOn Tue, 10 Nov 2026 at 09:00 Mouli <m@spendflo.com> wrote:\n> Patrick, quick one\n> about renewals";
    expect(stripQuoted(t)).toBe("Sounds good, Thursday works.\n\nPatrick");
  });

  it("reads the address out of a From header", () => {
    expect(addressOf("Patrick Vestergaard <Patrick.V@ADUSA.com>")).toBe("patrick.v@adusa.com");
    expect(addressOf("p@x.com")).toBe("p@x.com");
  });

  it("matches a known contact, else a new person at the account's domain", () => {
    const contacts = [{ id: "c1", email: "patrick@adusa.com", account_id: "a1" }];
    const accounts = [{ id: "a1", domain: "adusa.com" }];
    expect(matchSender("Patrick@adusa.com", contacts, accounts)).toEqual({ kind: "contact", contactId: "c1", accountId: "a1" });
    expect(matchSender("priya@eu.adusa.com", contacts, accounts)).toEqual({ kind: "account_domain", accountId: "a1" });
    expect(matchSender("x@other.com", contacts, accounts)).toEqual({ kind: "none" });
  });
});

describe("re-plan diff", () => {
  const s = (contactId: string, sequenceNo: number, channel: string, date: string | null, body = "b") => ({ contactId, sequenceNo, channel, date, offset: null, subject: null, body });
  it("labels kept, changed, removed and added steps per contact", () => {
    const rows = diffPlans(
      [s("p", 2, "email", "2026-11-13"), s("p", 3, "linkedin_message", "2026-11-19"), s("j", 3, "call", "2026-11-18")],
      [s("p", 2, "email", "2026-11-13"), s("p", 3, "call", "2026-11-16", "new"), s("cfo", 1, "email", "2026-11-17")],
    );
    expect(rows.map((r) => r.kind)).toEqual(["kept", "changed", "removed", "added"]);
    expect(rows[1].kind === "changed" && rows[1].what).toEqual(["channel", "date", "copy"]);
    expect(diffSummary(rows)).toEqual({ kept: 1, changed: 1, removed: 1, added: 1 });
  });
});
