import type { IsoDate } from "@/lib/calendar/dates";
import { addWorkingDays, nextValidDate, type CalendarContext, type DateScope } from "@/lib/calendar/working-calendar";
import type { Classification } from "@/lib/claude/schemas";

/**
 * What a confirmed response does (PRD M6, M10, section 11). Pure.
 * Nothing changes until the owner confirms the card.
 */

export type Effect = {
  countsAsReply: boolean;
  contactEngagement: "replied" | "stopped" | null;
  trackStatus: "replied" | "paused" | "stopped" | null;
  /** positive replies ask whether other tracks at the account pause too */
  askPauseOthers: boolean;
  campaignStatus: "responded" | null;
  doNotContact: boolean;
  bounced: boolean;
  shiftForReturnDate: boolean;
  startReplyTriggers: boolean;
  needsReplan: boolean;
  suggestAddContact: boolean;
};

export function effectOf(c: Classification): Effect {
  const base: Effect = {
    countsAsReply: true, contactEngagement: "replied", trackStatus: "paused", askPauseOthers: false, campaignStatus: "responded",
    doNotContact: false, bounced: false, shiftForReturnDate: false, startReplyTriggers: true, needsReplan: true, suggestAddContact: false,
  };
  switch (c) {
    case "positive":
      return { ...base, trackStatus: "replied", askPauseOthers: true };
    case "objection":
    case "not_now":
      return base;
    case "referral":
      return { ...base, suggestAddContact: true };
    case "neutral":
      return { ...base, trackStatus: null };
    case "wrong_person":
    case "unsubscribe":
      return { ...base, contactEngagement: "stopped", trackStatus: "stopped", campaignStatus: null, doNotContact: true, startReplyTriggers: false, needsReplan: false };
    case "auto_reply":
      return { ...base, countsAsReply: false, contactEngagement: null, trackStatus: null, campaignStatus: null, shiftForReturnDate: true, startReplyTriggers: false, needsReplan: false };
    case "bounce":
      return { ...base, countsAsReply: false, contactEngagement: null, trackStatus: null, campaignStatus: null, bounced: true, startReplyTriggers: false, needsReplan: false };
  }
}

export const NEEDS_REVIEW_BELOW = 0.7;
export const needsReview = (confidence: number | null | undefined) => confidence === null || confidence === undefined || confidence < NEEDS_REVIEW_BELOW;

/** Out of office: open steps move to the first working day after the return date, keeping their spacing. */
export function shiftPastReturn(steps: ReadonlyArray<{ id: string; date: IsoDate }>, returnDate: IsoDate, scope: DateScope, ctx: CalendarContext, minGap = 2) {
  const first = nextValidDate(addWorkingDays(returnDate, 1, scope, ctx), scope, ctx);
  const out: Array<{ id: string; date: IsoDate; movedFrom: IsoDate | null }> = [];
  let prev: IsoDate | null = null;
  for (const s of [...steps].sort((a, b) => a.date.localeCompare(b.date))) {
    let date = s.date < first ? first : s.date;
    if (prev) {
      const earliest = addWorkingDays(prev, minGap, scope, ctx);
      if (date < earliest) date = earliest;
    }
    out.push({ id: s.id, date, movedFrom: date !== s.date ? s.date : null });
    prev = date;
  }
  return out;
}

/**
 * Bounce: remaining email steps switch to LinkedIn. The first becomes a
 * connect request unless a connect is already done or planned; the rest
 * become LinkedIn messages. The owner reviews the copy.
 */
export function switchEmailsToLinkedIn(openSteps: ReadonlyArray<{ id: string; channel: string; date: IsoDate | null }>, hasConnect: boolean) {
  let connect = hasConnect;
  return [...openSteps]
    .filter((s) => s.channel === "email")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .map((s) => {
      const channel = connect ? "linkedin_message" : "linkedin_connect";
      connect = true;
      return { id: s.id, channel };
    });
}
