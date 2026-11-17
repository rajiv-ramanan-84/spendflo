import type { Min } from "./nav";
import { stateOf } from "@/lib/agent/config";

/** The Overview's health tiles (pure). Each tile says how something is doing and where to fix it. */

export type Tone = "ok" | "warn" | "bad" | "off";
export type Tile = { id: string; label: string; tone: Tone; value: string; detail: string | null; href: string; cta: string | null; min: Min };

export type HealthInputs = {
  me: { gmail: "ok" | "expired" | "missing"; slackSet: boolean; signatureSet: boolean; mailbox: { shared: boolean; id?: string | null; email: string | null; status: string | null } };
  sync: { status: "ok" | "failed" | "never"; agoMin: number | null; rows: number };
  slack: { connected: boolean; channel: boolean };
  feed: { configured: boolean; error: string | null };
  linkedin: { lastAgoHours: number | null; unmatched: number };
  assistant: { enabled: boolean; usd: number; usdCap: number; credits: number; creditCap: number; warnPct: number };
  drafting: { spent: number; budget: number };
  integrations: { enabled: number; failing: number; toReview: number };
  team: { expiredGmail: number };
  /** Today's sending across connected mailboxes (managers and admins only). */
  sending?: { atWarn: number; atMax: number; paused: number; domainsToFix: number; outreachInboxes: number; warn: number; protectCore: "off" | "warn" | "block" };
};

export const ago = (min: number | null) => (min === null ? "never" : min < 1 ? "just now" : min < 60 ? `${Math.round(min)} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 100);

export function buildTiles(i: HealthInputs): Tile[] {
  const t: Tile[] = [];
  t.push({ id: "gmail", label: "Your Gmail", tone: i.me.gmail === "ok" ? "ok" : "bad", value: i.me.gmail === "ok" ? "Connected" : i.me.gmail === "expired" ? "Needs reconnecting" : "Not connected", detail: i.me.gmail === "ok" ? "Drafts, sent detection and replies work." : "Sign out and back in with Google, and tick every permission.", href: "/settings/me", cta: i.me.gmail === "ok" ? null : "How to fix", min: "all" });
  const mb = i.me.mailbox;
  t.push({ id: "mailbox", label: "Sending mailbox", tone: mb.shared && mb.status !== "ok" ? "bad" : "ok", value: mb.shared ? `${mb.email ?? "Shared mailbox"}` : "Your own Gmail", detail: mb.shared ? (mb.status === "ok" ? "Shared mailbox connected." : "The shared mailbox needs connecting.") : "Drafts land in your own mailbox.", href: mb.shared && mb.status !== "ok" && mb.id ? `/api/mailboxes/connect?mailbox=${mb.id}` : "/settings/me", cta: mb.shared && mb.status !== "ok" ? "Connect" : null, min: "all" });
  t.push({ id: "me-slack", label: "Slack mentions", tone: i.me.slackSet ? "ok" : "warn", value: i.me.slackSet ? "Set" : "Not set", detail: i.me.slackSet ? "Alerts @mention you." : "Ask an admin to add your Slack member ID.", href: "/settings/me", cta: null, min: "all" });
  t.push({ id: "signature", label: "Your signature", tone: i.me.signatureSet ? "ok" : "warn", value: i.me.signatureSet ? "Set" : "Missing", detail: i.me.signatureSet ? "Added to every email you send." : "Emails go out without your name.", href: "/settings/writing/rules", cta: i.me.signatureSet ? null : "Set it", min: "all" });

  const syncTone: Tone = i.sync.status === "failed" ? "bad" : i.sync.status === "never" ? "warn" : (i.sync.agoMin ?? 0) > 180 || i.sync.rows > 0 ? "warn" : "ok";
  t.push({ id: "sync", label: "Sheet sync", tone: syncTone, value: i.sync.status === "never" ? "Never ran" : i.sync.status === "failed" ? `Failed ${ago(i.sync.agoMin)}` : `Synced ${ago(i.sync.agoMin)}`, detail: i.sync.rows ? `${i.sync.rows} row${i.sync.rows === 1 ? "" : "s"} to fix in the sheet.` : "Every row imported.", href: "/settings/data/sync", cta: syncTone === "ok" ? null : "Open", min: "manager" });
  t.push({ id: "slack", label: "Slack", tone: i.slack.connected && i.slack.channel ? "ok" : "warn", value: i.slack.connected ? (i.slack.channel ? "Connected" : "No channel set") : "Bot token missing", detail: "Morning plan and reply alerts.", href: "/settings/data/slack", cta: i.slack.connected && i.slack.channel ? null : "Set up", min: "manager" });
  t.push({ id: "feed", label: "Tapistro signals", tone: !i.feed.configured ? "off" : i.feed.error ? "bad" : "ok", value: !i.feed.configured ? "Not connected" : i.feed.error ? "Last run failed" : "Running", detail: i.feed.error ?? (i.feed.configured ? "Signals arrive from the feed sheet." : "Add the feed sheet to turn it on."), href: "/settings/data/signals", cta: i.feed.error ? "See why" : null, min: "manager" });
  t.push({ id: "linkedin", label: "LinkedIn emails", tone: i.linkedin.lastAgoHours === null ? "warn" : "ok", value: i.linkedin.lastAgoHours === null ? "None seen yet" : `Last seen ${i.linkedin.lastAgoHours < 1 ? "just now" : i.linkedin.lastAgoHours < 24 ? `${Math.round(i.linkedin.lastAgoHours)} h ago` : `${Math.round(i.linkedin.lastAgoHours / 24)} d ago`}`, detail: i.linkedin.lastAgoHours === null ? "Turn on LinkedIn email notifications so accepted invites are picked up." : i.linkedin.unmatched ? `${i.linkedin.unmatched} not matched to a campaign contact.` : "Accepted invites and replies are picked up.", href: "/settings/data/linkedin", cta: null, min: "manager" });

  const a = i.assistant;
  const aState = Math.max(["ok", "warn", "stop"].indexOf(stateOf(a.usd, a.usdCap, a.warnPct)), ["ok", "warn", "stop"].indexOf(stateOf(a.credits, a.creditCap, a.warnPct)));
  t.push({ id: "assistant", label: "Assistant", tone: !a.enabled ? "off" : aState === 2 ? "bad" : aState === 1 ? "warn" : "ok", value: !a.enabled ? "Switched off" : `$${a.usd.toFixed(2)} of $${a.usdCap} · ${Math.round(a.credits)} of ${a.creditCap} credits`, detail: !a.enabled ? "Nobody can use the chat." : aState === 2 ? "A limit is reached. It will refuse until next month or a raise." : aState === 1 ? `Past ${a.warnPct}% of a limit this month.` : "Within its monthly limits.", href: "/settings/ai/assistant", cta: aState ? "Review limits" : null, min: "manager" });
  const dp = pct(i.drafting.spent, i.drafting.budget);
  t.push({ id: "drafting", label: "Drafting budget", tone: dp >= 100 ? "bad" : dp >= 80 ? "warn" : "ok", value: `$${i.drafting.spent.toFixed(2)} of $${i.drafting.budget}`, detail: dp >= 100 ? "New drafts and re-plans are paused." : `${dp}% used this month.`, href: "/settings/ai/drafting", cta: dp >= 80 ? "Raise it" : null, min: "manager" });
  const ig = i.integrations;
  t.push({ id: "integrations", label: "Integrations", tone: ig.failing ? "bad" : ig.toReview ? "warn" : ig.enabled ? "ok" : "off", value: ig.enabled ? `${ig.enabled} on` : "None on", detail: ig.failing ? "A connection is failing." : ig.toReview ? `${ig.toReview} tool${ig.toReview === 1 ? "" : "s"} waiting for your review.` : ig.enabled ? "All tools reviewed." : "Add Tapistro so the assistant can find contacts.", href: "/settings/ai/integrations", cta: ig.failing || ig.toReview ? "Review" : null, min: "manager" });
  t.push({ id: "team-gmail", label: "Team Gmail", tone: i.team.expiredGmail ? "warn" : "ok", value: i.team.expiredGmail ? `${i.team.expiredGmail} need reconnecting` : "All connected", detail: i.team.expiredGmail ? "Their drafts and reply checks are paused until they sign in again." : "Everyone's mail connection is working.", href: "/settings/team/mailboxes", cta: i.team.expiredGmail ? "See who" : null, min: "manager" });
  if (i.sending) {
    const g = i.sending;
    const tone: Tone = g.paused || g.atMax ? "bad" : g.atWarn || g.domainsToFix || (!g.outreachInboxes && g.protectCore !== "off") ? "warn" : "ok";
    t.push({
      id: "sending", label: "Sending and domains", tone,
      value: g.paused ? `${g.paused} inbox${g.paused === 1 ? "" : "es"} paused` : g.atMax ? `${g.atMax} at today's limit` : g.atWarn ? `${g.atWarn} over ${g.warn} today` : !g.outreachInboxes ? "Company domain only" : "Within limits",
      detail: g.paused ? "An inbox was paused, usually for bounces. Clean the list, then resume it." : g.atMax ? "Nothing more can go from those addresses today." : g.atWarn ? "More than the warning level from one address puts the domain at risk." : g.domainsToFix ? `${g.domainsToFix} domain${g.domainsToFix === 1 ? "" : "s"} missing SPF, DKIM or DMARC.` : !g.outreachInboxes && g.protectCore !== "off" ? "Connect an outreach inbox so cold emails stay off the company domain." : "Daily counts are under the warning level and every domain is set up.",
      href: "/settings/team/mailboxes", cta: tone === "ok" ? null : "Open", min: "manager",
    });
  }
  return t;
}

const SEVERITY: Record<Tone, number> = { bad: 0, warn: 1, off: 3, ok: 4 };
/** What needs a person, worst first. Switched-off things are not problems. */
export const needsAttention = (tiles: Tile[]) => tiles.filter((t) => t.tone === "bad" || t.tone === "warn").sort((a, b) => SEVERITY[a.tone] - SEVERITY[b.tone]);
