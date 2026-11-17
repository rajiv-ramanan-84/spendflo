/**
 * Settings navigation: one definition for the menu, who may see each page, the "find a setting" index
 * and the old #links. Pure, so the menu, search and tests can never disagree.
 */

export type Role = "admin" | "manager" | "member";
export type Min = "all" | "manager" | "admin";
export type GroupId = "start" | "me" | "team" | "writing" | "ai" | "data";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  group: GroupId;
  /** Lowest role that sees this page in the menu */
  min: Min;
  blurb: string;
  keywords: string[];
};

export const GROUPS: Array<{ id: GroupId; label: string | null }> = [
  { id: "start", label: null },
  { id: "me", label: "You" },
  { id: "team", label: "Team" },
  { id: "writing", label: "Writing and campaigns" },
  { id: "ai", label: "AI and budgets" },
  { id: "data", label: "Data and channels" },
];

export const NAV: NavItem[] = [
  { id: "overview", label: "Overview", href: "/settings", group: "start", min: "all", blurb: "Health of everything, and what needs you.", keywords: ["home", "status", "health", "checklist", "setup"] },
  { id: "me", label: "My setup", href: "/settings/me", group: "me", min: "all", blurb: "Your Gmail, sending mailbox, Slack and signature.", keywords: ["gmail", "email", "signature", "slack", "profile", "mailbox", "connect"] },
  { id: "mailboxes", label: "Mailboxes", href: "/settings/team/mailboxes", group: "team", min: "manager", blurb: "Who sends from which mailbox, daily sending limits and domain protection.", keywords: ["shared", "sid", "gmail", "send", "oauth", "writes as", "limit", "warning", "cap", "30", "25", "domain", "spf", "dkim", "dmarc", "warm up", "bounce", "outreach", "inbox", "core domain"] },
  { id: "rules", label: "Writing rules", href: "/settings/writing/rules", group: "writing", min: "all", blurb: "How Claude writes: team, persona and sender voice, signatures.", keywords: ["voice", "tone", "signature", "persona", "subject line", "instructions"] },
  { id: "founder", label: "Founder outreach", href: "/settings/writing/rules?tab=founder", group: "writing", min: "manager", blurb: "The 20 minute validation style and its hypotheses.", keywords: ["validate", "hypothesis", "small group", "20 minutes", "sid", "rajiv"] },
  { id: "playbook", label: "Campaign playbook", href: "/settings/writing/playbook", group: "writing", min: "manager", blurb: "The advanced playbook Claude follows for every draft.", keywords: ["skill", "upload", "download", "claude skill", "version"] },
  { id: "assistant", label: "Assistant", href: "/settings/ai/assistant", group: "ai", min: "manager", blurb: "Limits, model and the on/off switch for the chat assistant.", keywords: ["chat", "budget", "credits", "kill switch", "limit", "tapistro", "claude", "cap"] },
  { id: "drafting", label: "Drafting and models", href: "/settings/ai/drafting", group: "ai", min: "manager", blurb: "Monthly drafting budget, models and auto drafting.", keywords: ["claude spend", "budget", "model", "opus", "sonnet", "haiku", "bulk", "auto draft"] },
  { id: "integrations", label: "Integrations", href: "/settings/ai/integrations", group: "ai", min: "manager", blurb: "Tools the assistant may use, such as Tapistro.", keywords: ["mcp", "tapistro", "tools", "token", "server", "permissions"] },
  { id: "traces", label: "Traces and audit log", href: "/agent", group: "ai", min: "all", blurb: "What the assistant did, step by step, and every change.", keywords: ["trace", "audit", "log", "history", "runs", "cost"] },
  { id: "sync", label: "Sheet sync", href: "/settings/data/sync", group: "data", min: "manager", blurb: "The hourly account book sync and rows to fix.", keywords: ["sheet", "google sheet", "master", "contacts", "data quality", "rows"] },
  { id: "signals", label: "Signals feed", href: "/settings/data/signals", group: "data", min: "manager", blurb: "Tapistro signals: what was accepted or rejected.", keywords: ["tapistro", "vendor", "signals", "feed", "accepted rate", "rejected"] },
  { id: "slack", label: "Slack", href: "/settings/data/slack", group: "data", min: "manager", blurb: "Channel, morning plan time and @mentions.", keywords: ["channel", "morning plan", "reply alerts", "member id", "mention"] },
  { id: "linkedin", label: "LinkedIn emails", href: "/settings/data/linkedin", group: "data", min: "manager", blurb: "What the mail scan did with LinkedIn notifications.", keywords: ["accepted", "invite", "connect", "inmail", "notifications", "unmatched"] },
  { id: "backup", label: "Backup", href: "/settings/data/backup", group: "data", min: "admin", blurb: "Download a full backup of the database.", keywords: ["download", "export", "database", "monthly"] },
];

const RANK: Record<Role, number> = { member: 0, manager: 1, admin: 2 };
const NEED: Record<Min, number> = { all: 0, manager: 1, admin: 2 };

export const canSee = (role: Role, min: Min) => RANK[role] >= NEED[min];
export const visibleNav = (role: Role) => NAV.filter((n) => canSee(role, n.min));
export const navById = (id: string) => NAV.find((n) => n.id === id);

/** The page a path belongs to, ignoring the query string. */
export const navForPath = (path: string) => NAV.filter((n) => n.href.split("?")[0] === path)[0] ?? null;

/** Old #links (before the redesign) and where they live now. */
export const LEGACY_HASH: Record<string, string> = {
  data: "/settings/data/sync",
  mailboxes: "/settings/team/mailboxes",
};

/** Individual settings people look for, so search finds "Tapistro credits" and lands on the right page. */
export const SEARCH_EXTRAS: Array<{ label: string; to: string; keywords: string[] }> = [
  { label: "Tapistro credit limit", to: "assistant", keywords: ["credits", "cap", "monthly", "tapistro"] },
  { label: "Claude budget for the assistant", to: "assistant", keywords: ["dollars", "usd", "spend", "monthly", "limit"] },
  { label: "Turn the assistant off (kill switch)", to: "assistant", keywords: ["disable", "switch off", "stop"] },
  { label: "Most one assistant request may cost", to: "assistant", keywords: ["per request", "cap", "runaway"] },
  { label: "Monthly drafting budget", to: "drafting", keywords: ["claude", "drafts", "usd", "limit"] },
  { label: "Which model writes drafts", to: "drafting", keywords: ["opus", "sonnet", "haiku", "tier a"] },
  { label: "Auto write drafts for new Tier A accounts", to: "drafting", keywords: ["automatic", "after sync", "overnight"] },
  { label: "Most accounts per bulk generate", to: "drafting", keywords: ["batch", "limit", "25"] },
  { label: "Add a shared mailbox", to: "mailboxes", keywords: ["sid@", "connect", "write as"] },
  { label: "Daily sending limit per address", to: "mailboxes", keywords: ["maximum", "30", "cap", "emails a day", "stop"] },
  { label: "Sending warning level", to: "mailboxes", keywords: ["25", "warn", "slow down", "over"] },
  { label: "Protect the company domain from cold email", to: "mailboxes", keywords: ["core domain", "spendflo.com", "block", "outreach domain"] },
  { label: "Connect another inbox", to: "me", keywords: ["outreach", "extra email", "add inbox", "mouli"] },
  { label: "Change my signature", to: "rules", keywords: ["sign off", "name", "title"] },
  { label: "Sender voice", to: "rules", keywords: ["how i sound", "tone"] },
  { label: "Persona writing rules", to: "rules", keywords: ["procurement leader", "economic buyer", "champion"] },
  { label: "Small group line and hypotheses", to: "founder", keywords: ["validation", "founder", "20 minutes"] },
  { label: "Connect Tapistro or another MCP server", to: "integrations", keywords: ["add", "token", "url", "test connection"] },
  { label: "Review tool permissions", to: "integrations", keywords: ["read", "needs approval", "blocked"] },
  { label: "Rows the sheet sync could not use", to: "sync", keywords: ["errors", "fix", "ignore", "data quality"] },
  { label: "Slack channel and morning plan time", to: "slack", keywords: ["post", "time", "ist"] },
  { label: "Slack member IDs for @mentions", to: "slack", keywords: ["handle", "user id"] },
  { label: "Accepted LinkedIn invites", to: "linkedin", keywords: ["connect", "accepted", "message"] },
  { label: "Download a backup", to: "backup", keywords: ["export", "save to drive"] },
  { label: "Upload an edited campaign playbook", to: "playbook", keywords: ["skill", "markdown", "version"] },
  { label: "Why was a signal rejected", to: "signals", keywords: ["tapistro", "reason", "feed"] },
];

export type SearchHit = { label: string; href: string; where: string };

/** Everything that matches every word typed, limited to pages this role can open. */
export function searchSettings(q: string, role: Role, limit = 7): SearchHit[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const pool: Array<SearchHit & { text: string; boost: number }> = [];
  for (const n of visibleNav(role)) pool.push({ label: n.label, href: n.href, where: GROUPS.find((g) => g.id === n.group)?.label ?? "Settings", text: `${n.label} ${n.blurb} ${n.keywords.join(" ")}`.toLowerCase(), boost: 1 });
  for (const e of SEARCH_EXTRAS) {
    const n = navById(e.to);
    if (!n || !canSee(role, n.min)) continue;
    pool.push({ label: e.label, href: n.href, where: n.label, text: `${e.label} ${e.keywords.join(" ")} ${n.label}`.toLowerCase(), boost: 0 });
  }
  return pool
    .filter((p) => words.every((w) => p.text.includes(w)))
    .sort((a, b) => Number(b.label.toLowerCase().includes(words[0])) - Number(a.label.toLowerCase().includes(words[0])) || b.boost - a.boost)
    .slice(0, limit)
    .map(({ label, href, where }) => ({ label, href, where }));
}
