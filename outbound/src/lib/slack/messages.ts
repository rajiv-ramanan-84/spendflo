/**
 * Slack copy for #outbound-command (PRD M9). Pure, so it is tested.
 * Rules: lead with wins, overdue is a count never a callout, never paste a
 * prospect's words (one-line summary only), @mention the owner on anything
 * that needs action, and link straight into the app.
 */

export type Block = Record<string, unknown>;
export type SlackMessage = { text: string; blocks: Block[] };

export type Person = { name: string; slackUserId: string | null };

/** <@U123> when the handle is mapped, otherwise the plain first name. */
export function mention(p: Person): string {
  return p.slackUserId ? `<@${p.slackUserId}>` : p.name.split(" ")[0];
}

/** Slack mrkdwn treats & < > as control characters. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type MorningTotals = { dueToday: number; repliesWaiting: number; overdue: number; newDrafts: number; meetingsYesterday: number; repliesYesterday: number };

export function morningParent(dateLabel: string, t: MorningTotals, appUrl: string): SlackMessage {
  const wins: string[] = [];
  if (t.meetingsYesterday) wins.push(`${plural(t.meetingsYesterday, "meeting")} booked`);
  if (t.repliesYesterday) wins.push(`${plural(t.repliesYesterday, "reply", "replies")} in`);
  const lines = [
    wins.length ? `:tada: Yesterday: ${wins.join(", ")}.` : null,
    `*${plural(t.dueToday, "step")} due today* · ${plural(t.repliesWaiting, "reply", "replies")} waiting · ${t.overdue} overdue${t.newDrafts ? ` · ${plural(t.newDrafts, "new draft")} ready` : ""}`,
  ].filter(Boolean) as string[];
  return {
    text: `Morning plan, ${dateLabel}: ${t.dueToday} steps due, ${t.repliesWaiting} replies waiting`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `Morning plan · ${dateLabel}` } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      { type: "context", elements: [{ type: "mrkdwn", text: `Each person's plan is in the thread. <${appUrl}/today|Open Today>` }] },
    ],
  };
}

export type PersonPlan = {
  person: Person;
  dueToday: number;
  overdue: number;
  replies: number;
  byChannel: { email: number; linkedin: number; call: number };
  focus: Array<{ id: string; name: string; reason: string | null }>;
  needsReconnect: boolean;
};

export function personThread(p: PersonPlan, appUrl: string): SlackMessage {
  const mix = [p.byChannel.email && `${p.byChannel.email} email`, p.byChannel.linkedin && `${p.byChannel.linkedin} LinkedIn`, p.byChannel.call && plural(p.byChannel.call, "call")].filter(Boolean).join(", ");
  const head = p.dueToday || p.replies
    ? `${mention(p.person)}: ${plural(p.dueToday, "step")} today${mix ? ` (${mix})` : ""}${p.replies ? `, ${plural(p.replies, "reply", "replies")} to work` : ""}${p.overdue ? ` · ${p.overdue} carried over` : ""}`
    : `${mention(p.person)}: a clear day. Good time to review drafts or add contacts.`;
  const focus = p.focus.slice(0, 3).map((f, i) => `${i + 1}. <${appUrl}/accounts/${f.id}|${esc(f.name)}>${f.reason ? ` · ${esc(f.reason)}` : ""}`);
  const lines = [head, focus.length ? `*Focus:*\n${focus.join("\n")}` : null, p.needsReconnect ? ":warning: Gmail needs reconnecting. Sign out and back in; nothing was lost." : null].filter(Boolean);
  return { text: head.replace(/<@[A-Z0-9]+>/g, p.person.name), blocks: [{ type: "section", text: { type: "mrkdwn", text: lines.join("\n\n") } }] };
}

const SENTIMENT: Record<string, string> = {
  positive: ":large_green_circle: Positive",
  neutral: ":white_circle: Neutral",
  objection: ":large_orange_circle: Objection",
  not_now: ":large_orange_circle: Not now",
  referral: ":large_blue_circle: Referral",
  wrong_person: ":red_circle: Wrong person",
  unsubscribe: ":red_circle: Unsubscribe",
  bounce: ":red_circle: Bounced",
};

export type ReplyAlert = {
  responseId: string;
  accountId: string;
  accountName: string;
  contactName: string | null;
  persona: string | null;
  classification: string | null;
  summary: string | null;
  channel: string;
  owner: Person | null;
  source: "detected" | "manual";
};

export function replyAlert(a: ReplyAlert, appUrl: string): SlackMessage {
  const who = a.contactName ? `${esc(a.contactName)}${a.persona && a.persona !== "other" ? ` (${a.persona.replace(/_/g, " ")})` : ""}` : "Someone new";
  const sentiment = a.classification ? (SENTIMENT[a.classification] ?? a.classification) : ":grey_question: To classify";
  const verb = a.source === "manual" ? "logged a reply from" : "reply from";
  const owner = a.owner ? mention(a.owner) : "Unassigned";
  const summary = a.summary ? esc(a.summary.split("\n")[0].slice(0, 200)) : "";
  const link = `${appUrl}/accounts/${a.accountId}?reply=${a.responseId}`;
  return {
    text: `${a.accountName}: ${verb} ${a.contactName ?? "someone new"}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${esc(a.accountName)}* · ${verb} ${who}\n${sentiment}${summary ? ` · ${summary}` : ""}\n${owner}${a.source === "detected" ? ", confirm and re-plan when you can." : ""}` } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in app" }, url: link, style: "primary" }] },
    ],
  };
}

/** Classifications that do not need the channel's attention. */
export function alertWorthy(classification: string | null): boolean {
  return classification !== "auto_reply";
}
