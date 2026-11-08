import { fmtDate } from "@/lib/format";

/**
 * Tasks page views, filters and grouping. Pure, so the screen, the link in the
 * address bar and the tests all agree on what "Overdue, Sid, LinkedIn" means.
 */

export type TaskLike = {
  id: string;
  due_date: string | null;
  bucket: string;
  state: "ready" | "edit" | "waiting";
  channel: string;
  assignee_id: string | null;
  account: { id: string; name: string; tier: string | null };
  contact: { full_name: string };
};

export type View = "overdue" | "today" | "next7" | "all";
export type ChannelTab = "all" | "email" | "connect" | "message" | "call";
export type Sort = "due" | "account";
export type Filters = { from: string; state: string; tier: string; account: string; q: string };

export const VIEWS: Array<{ id: View; label: string }> = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "next7", label: "Next 7 days" },
  { id: "all", label: "All open" },
];

export const CHANNEL_TABS: Array<{ id: ChannelTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "email", label: "Email" },
  { id: "connect", label: "Connect" },
  { id: "message", label: "LinkedIn msg" },
  { id: "call", label: "Call" },
];

export const STATE_LABEL: Record<TaskLike["state"], string> = { ready: "Ready", edit: "Needs edit", waiting: "Waiting" };

export const EMPTY_FILTERS: Filters = { from: "", state: "", tier: "", account: "", q: "" };

export function inView(t: TaskLike, view: View): boolean {
  if (view === "overdue") return t.bucket === "overdue";
  if (view === "today") return t.bucket === "today";
  if (view === "next7") return t.bucket === "tomorrow" || t.bucket === "week";
  return true;
}

export function channelTab(channel: string): Exclude<ChannelTab, "all"> | null {
  if (channel === "email") return "email";
  if (channel === "linkedin_connect") return "connect";
  if (channel === "linkedin_message" || channel === "linkedin_inmail") return "message";
  if (channel === "call") return "call";
  return null;
}

export function passes(t: TaskLike, f: Filters, senderOf: (id: string | null) => string): boolean {
  const q = f.q.trim().toLowerCase();
  return (
    (!f.from || senderOf(t.assignee_id) === f.from) &&
    (!f.state || t.state === f.state) &&
    (!f.tier || t.account.tier === f.tier) &&
    (!f.account || t.account.id === f.account) &&
    (!q || `${t.contact.full_name} ${t.account.name}`.toLowerCase().includes(q))
  );
}

export function sortTasks<T extends TaskLike>(tasks: readonly T[], sort: Sort): T[] {
  const due = (t: TaskLike) => t.due_date ?? "9999-12-31";
  return [...tasks].sort((a, b) =>
    sort === "account"
      ? a.account.name.localeCompare(b.account.name) || due(a).localeCompare(due(b))
      : due(a).localeCompare(due(b)) || a.account.name.localeCompare(b.account.name) || a.contact.full_name.localeCompare(b.contact.full_name),
  );
}

/** The header a row sits under: its day (or Overdue), or its account when sorted by account. */
export function groupKey(t: TaskLike, sort: Sort, today: string): { key: string; label: string } {
  if (sort === "account") return { key: t.account.id, label: t.account.name };
  if (!t.due_date) return { key: "waiting", label: "Waits on a reply" };
  if (t.due_date < today) return { key: "overdue", label: "Overdue" };
  if (t.due_date === today) return { key: today, label: `Today · ${fmtDate(today)}` };
  return { key: t.due_date, label: fmtDate(t.due_date) };
}

/** Filters live in the link, so a view like "Overdue, Sid" can be saved or shared. */
export function toQuery(s: { view: View; ch: ChannelTab; sort: Sort; f: Filters; scope?: string }): string {
  const p = new URLSearchParams();
  if (s.scope === "team") p.set("scope", "team");
  if (s.view !== "today") p.set("view", s.view);
  if (s.ch !== "all") p.set("ch", s.ch);
  if (s.sort !== "due") p.set("sort", s.sort);
  for (const [k, v] of Object.entries(s.f)) if (v) p.set(k, v);
  const q = p.toString();
  return q ? `?${q}` : "";
}

export function fromQuery(sp: Record<string, string | undefined>): { view: View; ch: ChannelTab; sort: Sort; f: Filters } {
  const view = VIEWS.some((v) => v.id === sp.view) ? (sp.view as View) : "today";
  const ch = CHANNEL_TABS.some((c) => c.id === sp.ch) ? (sp.ch as ChannelTab) : "all";
  const sort: Sort = sp.sort === "account" ? "account" : "due";
  return { view, ch, sort, f: { from: sp.from ?? "", state: sp.state ?? "", tier: sp.tier ?? "", account: sp.account ?? "", q: sp.q ?? "" } };
}
