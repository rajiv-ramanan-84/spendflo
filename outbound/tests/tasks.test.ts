import { describe, expect, it } from "vitest";
import { pullForwardBlock, type PullInput } from "@/lib/caps/pull-forward";
import { DEFAULT_CAPS, type Touch } from "@/lib/caps/schedule";
import type { CalendarContext } from "@/lib/calendar/working-calendar";
import { needsEdit } from "@/lib/tasks/state";
import { fromQuery, groupKey, inView, passes, sortTasks, toQuery, EMPTY_FILTERS, type TaskLike } from "@/lib/tasks/view";

const ctx: CalendarContext = { prospectHolidays: () => new Set(), teamHolidays: new Set(["2026-11-26"]), outOfOffice: new Map(), quietPeriods: [] };
const TODAY = "2026-11-09"; // Monday

function input(over: Partial<PullInput> = {}, step: Partial<PullInput["step"]> = {}): PullInput {
  return {
    step: { id: "s1", sequenceNo: 2, dueDate: "2026-11-12", contactId: "c1", accountId: "a1", assigneeId: "u1", channel: "linkedin_connect", country: "US", ...step },
    today: TODAY, openSequenceNos: [3], existing: [], caps: DEFAULT_CAPS, ctx, ...over,
  };
}
const touch = (key: string, date: string, o: Partial<Touch> = {}): Touch => ({ key, date, contactId: "cX", accountId: "aX", assigneeId: "uX", channel: "email", ...o });

describe("Do today (pull forward)", () => {
  it("allows a ready future step", () => {
    expect(pullForwardBlock(input())).toBeNull();
  });
  it("blocks a step that is already due or waits on a trigger", () => {
    expect(pullForwardBlock(input({}, { dueDate: TODAY }))).toMatch(/already due/);
    expect(pullForwardBlock(input({}, { dueDate: null }))).toMatch(/trigger/);
  });
  it("keeps the order of a person's steps", () => {
    expect(pullForwardBlock(input({ openSequenceNos: [1, 3] }))).toBe("Step 1 for this person isn't done yet");
  });
  it("keeps one touch per person per day", () => {
    expect(pullForwardBlock(input({ existing: [touch("other", TODAY, { contactId: "c1" })] }))).toMatch(/already touches this contact/);
  });
  it("keeps the weekly account cap", () => {
    const six = Array.from({ length: 6 }, (_, i) => touch(`t${i}`, "2026-11-10", { contactId: `c${i + 10}`, accountId: "a1" }));
    expect(pullForwardBlock(input({ existing: six }))).toMatch(/weekly touch limit for this account/);
  });
  it("ignores the step's own current slot", () => {
    expect(pullForwardBlock(input({ existing: [touch("s1", "2026-11-12", { contactId: "c1", accountId: "a1" })] }))).toBeNull();
  });
  it("won't pull onto a day off", () => {
    expect(pullForwardBlock(input({ today: "2026-11-26" }, { dueDate: "2026-11-27" }))).toMatch(/day off/);
  });
});

describe("Needs edit", () => {
  const person = { full_name: "Michele King", title: "VP", email: "m@ally.com", linkedin_url: "https://linkedin.com/in/m" };
  it("is ready when copy and contact details are there", () => {
    expect(needsEdit({ channel: "email", subject: "Hi", body: "Hi {first_name}", call_script: null }, person, "Ally")).toBeNull();
  });
  it("flags an unknown placeholder, a missing subject or email, and a missing LinkedIn URL", () => {
    expect(needsEdit({ channel: "email", subject: "Hi", body: "With {mill_count} sites", call_script: null }, person, "Ally")).toMatch(/placeholder/);
    expect(needsEdit({ channel: "email", subject: "", body: "Hi", call_script: null }, person, "Ally")).toMatch(/subject/);
    expect(needsEdit({ channel: "email", subject: "Hi", body: "Hi", call_script: null }, { ...person, bounced: true }, "Ally")).toMatch(/working email/);
    expect(needsEdit({ channel: "linkedin_connect", subject: null, body: "Hi", call_script: null }, { ...person, linkedin_url: null }, "Ally")).toMatch(/LinkedIn/);
  });
});

const task = (id: string, o: Partial<TaskLike>): TaskLike => ({ id, due_date: TODAY, bucket: "today", state: "ready", channel: "email", assignee_id: "u1", account: { id: "a1", name: "Ally", tier: "A" }, contact: { full_name: id }, ...o });

describe("Tasks views and filters", () => {
  const ts = [
    task("late", { due_date: "2026-11-06", bucket: "overdue" }),
    task("now", {}),
    task("wed", { due_date: "2026-11-11", bucket: "week", channel: "linkedin_connect", account: { id: "a2", name: "Graybar", tier: "B" } }),
    task("wait", { due_date: null, bucket: "waiting", state: "waiting" }),
  ];
  it("puts each task in its view", () => {
    expect(ts.filter((t) => inView(t, "overdue")).map((t) => t.id)).toEqual(["late"]);
    expect(ts.filter((t) => inView(t, "today")).map((t) => t.id)).toEqual(["now"]);
    expect(ts.filter((t) => inView(t, "next7")).map((t) => t.id)).toEqual(["wed"]);
    expect(ts.filter((t) => inView(t, "all"))).toHaveLength(4);
  });
  it("filters by sender, status, tier and search", () => {
    const senderOf = (id: string | null) => (id === "u1" ? "Rajiv" : "Sid");
    expect(passes(ts[0], { ...EMPTY_FILTERS, from: "Sid" }, senderOf)).toBe(false);
    expect(ts.filter((t) => passes(t, { ...EMPTY_FILTERS, state: "waiting" }, senderOf)).map((t) => t.id)).toEqual(["wait"]);
    expect(ts.filter((t) => passes(t, { ...EMPTY_FILTERS, tier: "B" }, senderOf)).map((t) => t.id)).toEqual(["wed"]);
    expect(ts.filter((t) => passes(t, { ...EMPTY_FILTERS, q: "gray" }, senderOf)).map((t) => t.id)).toEqual(["wed"]);
  });
  it("sorts by date with waiting last, and groups by day", () => {
    expect(sortTasks(ts, "due").map((t) => t.id)).toEqual(["late", "now", "wed", "wait"]);
    expect(groupKey(ts[0], "due", TODAY).label).toBe("Overdue");
    expect(groupKey(ts[1], "due", TODAY).label).toBe("Today · Mon 9 Nov");
    expect(groupKey(ts[3], "due", TODAY).label).toBe("Waits on a reply");
    expect(groupKey(ts[2], "account", TODAY).label).toBe("Graybar");
  });
  it("round-trips filters through the link", () => {
    const s = { view: "overdue" as const, ch: "connect" as const, sort: "due" as const, f: { ...EMPTY_FILTERS, from: "Sid" } };
    const q = toQuery(s);
    expect(q).toBe("?view=overdue&ch=connect&from=Sid");
    expect(fromQuery(Object.fromEntries(new URLSearchParams(q)))).toEqual(s);
    expect(fromQuery({ view: "nonsense" }).view).toBe("today");
  });
});
