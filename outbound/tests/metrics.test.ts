import { describe, expect, it } from "vitest";
import { computeMetrics, type Snapshot } from "@/lib/metrics/compute";

// Seeded team, counted by hand. Today is Thu 5 Nov 2026, range is the last 30 days.
const step = (id: string, campaign_id: string, track_id: string, contact_id: string, assignee_id: string, channel: string, status: string, due_date: string, completed_at: string | null = null) =>
  ({ id, campaign_id, track_id, contact_id, assignee_id, channel, status, due_date, completed_at, completed_by: completed_at ? assignee_id : null });

const S: Snapshot = {
  users: [{ id: "u1", name: "Mouli" }, { id: "u2", name: "Sid" }],
  accounts: [
    { id: "A1", name: "Acme", tier: "A", segment: "Retail", owner_id: "u1", archived: false },
    { id: "A2", name: "Bolt", tier: "B", segment: "Retail", owner_id: "u1", archived: false },
    { id: "A3", name: "Crane", tier: "A", segment: "Industrial", owner_id: "u2", archived: false },
    { id: "A4", name: "Dune", tier: "C", segment: null, owner_id: null, archived: false },
    { id: "A5", name: "Echo", tier: "A", segment: null, owner_id: "u2", archived: true },
  ],
  contacts: [
    { id: "c1", account_id: "A1", engagement_status: "replied" },
    { id: "c2", account_id: "A1", engagement_status: "meeting" },
    { id: "c3", account_id: "A1", engagement_status: "contacted" },
    { id: "c4", account_id: "A2", engagement_status: "connected" },
    { id: "c5", account_id: "A2", engagement_status: "not_contacted" },
    { id: "c6", account_id: "A3", engagement_status: "contacted" },
    { id: "c7", account_id: "A4", engagement_status: "replied" },
    { id: "c8", account_id: "A5", engagement_status: "replied" },
  ],
  campaigns: [
    { id: "K1", account_id: "A1", owner_id: "u1", status: "meeting_booked", updated_at: "2026-11-03T09:00:00Z" },
    { id: "K2", account_id: "A2", owner_id: "u1", status: "active", updated_at: "2026-11-01T09:00:00Z" },
    { id: "K3", account_id: "A3", owner_id: "u2", status: "active", updated_at: "2026-11-01T09:00:00Z" },
  ],
  tracks: [
    { id: "t1", status: "replied" }, { id: "t2", status: "meeting" }, { id: "t3", status: "active" },
    { id: "t4", status: "active" }, { id: "t6", status: "active" }, { id: "t7", status: "paused" },
  ],
  steps: [
    step("s1", "K1", "t1", "c1", "u1", "email", "done", "2026-11-02", "2026-11-02T10:00:00Z"),
    step("s2", "K1", "t2", "c2", "u1", "call", "done", "2026-11-03", "2026-11-04T10:00:00Z"),
    step("s3", "K2", "t3", "c4", "u1", "linkedin_connect", "done", "2026-11-04", "2026-11-04T08:00:00Z"),
    step("s4", "K2", "t4", "c5", "u1", "email", "due", "2026-11-05"),
    step("s5", "K2", "t4", "c5", "u1", "email", "overdue", "2026-11-01"),
    step("s6", "K3", "t6", "c6", "u2", "email", "overdue", "2026-11-04"),
    step("s7", "K3", "t7", "c6", "u2", "email", "upcoming", "2026-11-05"),
    step("s8", "K2", "t3", "c4", "u1", "email", "superseded", "2026-11-03"),
  ],
  responses: [
    { id: "r1", account_id: "A1", campaign_id: "K1", contact_id: "c1", channel: "email", classification: "positive", state: "confirmed", received_at: "2026-11-02T10:00:00Z", confirmed_at: "2026-11-02T11:00:00Z" },
    { id: "r2", account_id: "A1", campaign_id: "K1", contact_id: "c2", channel: "call", classification: "positive", state: "confirmed", received_at: "2026-11-03T10:00:00Z", confirmed_at: "2026-11-03T10:30:00Z" },
    { id: "r3", account_id: "A3", campaign_id: "K3", contact_id: "c6", channel: "email", classification: "auto_reply", state: "confirmed", received_at: "2026-11-04T10:00:00Z", confirmed_at: "2026-11-04T10:00:00Z" },
    { id: "r4", account_id: "A2", campaign_id: "K2", contact_id: "c4", channel: "linkedin_message", classification: "neutral", state: "pending", received_at: "2026-11-03T00:00:00Z", confirmed_at: null },
    { id: "r5", account_id: "A4", campaign_id: null, contact_id: "c7", channel: "email", classification: "positive", state: "confirmed", received_at: "2026-11-04T00:00:00Z", confirmed_at: "2026-11-04T00:00:00Z" },
    { id: "r6", account_id: "A2", campaign_id: "K2", contact_id: "c5", channel: "email", classification: "neutral", state: "dismissed", received_at: "2026-11-04T00:00:00Z", confirmed_at: null },
    { id: "r7", account_id: "A1", campaign_id: "K1", contact_id: "c3", channel: "email", classification: "positive", state: "confirmed", received_at: "2026-09-01T00:00:00Z", confirmed_at: "2026-09-01T00:00:00Z" },
  ],
  versions: [{ campaign_id: "K1", reason: "response", created_at: "2026-11-02T14:00:00Z" }],
};
const F = { from: "2026-10-06", today: "2026-11-05", now: new Date("2026-11-05T12:00:00Z") };

describe("Command Center metrics on seeded data", () => {
  const m = computeMetrics(S, F);

  it("KPI strip matches the manual count", () => {
    expect(m.kpis).toEqual({
      assigned: 3, // A1 A2 A3 (A4 unowned, A5 archived)
      live: 3,
      coverage: 100,
      penetration: 33, // A1 only
      replies: 4, // r1 r2 r4 r5; auto reply, dismissed and out of range excluded
      meetings: 1, // K1
      dueToday: 1, // s4; s7 sits on a paused track
      onTime: 29, // s1 s3 of 7 due in range
      multiThreaded: 1, // A1 has two engaged personas
    });
  });

  it("funnel narrows and each stage includes the next", () => {
    expect(m.funnel.map((s) => [s.key, s.value])).toEqual([["assigned", 3], ["touched", 2], ["connected", 2], ["engaged", 1], ["meeting", 1]]);
    expect(new Set(m.drill["funnel:connected"].ids)).toEqual(new Set(["A1", "A2"]));
  });

  it("by owner", () => {
    expect(m.owners.find((o) => o.userId === "u1")).toEqual({ userId: "u1", name: "Mouli", accounts: 2, live: 2, dueToday: 1, overdue: 1, doneInRange: 3, replies: 3, meetings: 1, penetration: 50, onTime: 40, replanHours: 4 });
    expect(m.owners.find((o) => o.userId === "u2")).toEqual({ userId: "u2", name: "Sid", accounts: 1, live: 1, dueToday: 0, overdue: 1, doneInRange: 0, replies: 0, meetings: 0, penetration: 0, onTime: 0, replanHours: null });
  });

  it("reply rate by channel counts personas, not messages", () => {
    expect(m.replyRate).toEqual([
      { channel: "email", contacted: 1, replied: 1, rate: 100 },
      { channel: "linkedin", contacted: 1, replied: 1, rate: 100 },
      { channel: "call", contacted: 1, replied: 1, rate: 100 },
    ]);
  });

  it("campaigns in motion sort by needs attention; stalled has the reason", () => {
    expect(m.motion.map((x) => x.campaignId)).toEqual(["K2", "K3", "K1"]);
    expect(m.stalled.map((x) => [x.campaignId, x.stalledReason])).toEqual([["K2", "Reply not re-planned in 24 hours"]]);
    const k2 = m.motion[0];
    expect([k2.lastTouch, k2.nextStep, k2.overdue, k2.repliesWaiting, k2.day, k2.span]).toEqual(["2026-11-04", "2026-11-01", 1, 1, 5, 5]);
  });

  it("an overdue step older than 2 days stalls a campaign", () => {
    const later = computeMetrics(S, { ...F, today: "2026-11-09", now: new Date("2026-11-09T12:00:00Z") });
    expect(later.stalled.find((x) => x.campaignId === "K3")?.stalledReason).toBe("Overdue since 2026-11-04");
  });

  it("every number has a list behind it", () => {
    expect(m.drill.dueToday.ids).toEqual(["s4"]);
    expect(m.drill["owner:u1:overdue"].ids).toEqual(["s5"]);
    expect(m.drill.penetration.ids).toEqual(["A1"]);
    expect(m.drill.stalled.ids).toEqual(["K2"]);
  });

  it("filters by owner and tier", () => {
    expect(computeMetrics(S, { ...F, ownerId: "u2" }).kpis.assigned).toBe(1);
    const tierA = computeMetrics(S, { ...F, tier: "A" });
    expect([tierA.kpis.assigned, tierA.kpis.penetration]).toEqual([2, 50]);
    expect(computeMetrics(S, { ...F, segment: "Retail" }).kpis.assigned).toBe(2);
  });
});
