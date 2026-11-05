import { isIsoDate, type IsoDate } from "@/lib/calendar/dates";
import { addWorkingDays, rollForward, INVALID_REASON_COPY, type CalendarContext } from "@/lib/calendar/working-calendar";
import { scheduleTouches, MOVE_REASON_COPY, type Caps, type Touch } from "@/lib/caps/schedule";
import type { CampaignOutput, Channel } from "./schemas";

/**
 * Turns Claude's campaign into something the app can store, or explains why
 * it cannot. Pure. Never trusts the model on facts the app owns: which
 * contacts exist, who is a user, which dates are working days, and the caps.
 *
 * Two kinds of findings:
 * - blocking flags: the owner must resolve or dismiss each before Launch
 * - notes: the app already fixed it (a moved date) and says so on the step
 */

export type ValidationContact = {
  id: string;
  email: string | null;
  hasEmail: boolean;
  hasLinkedIn: boolean;
  country: string | null;
  excluded: boolean;
  doNotContact: boolean;
};

export type ValidationUser = { id: string; key: string; active: boolean };

export type ValidationInput = {
  accountId: string;
  ownerId: string;
  contacts: ValidationContact[];
  users: ValidationUser[];
  campaignStartDate: IsoDate;
  caps: Caps;
  /** steps already scheduled anywhere (other campaigns), for caps and collisions */
  existingTouches: Touch[];
  ctx: CalendarContext;
  emailWordFlag?: number;
  linkedinConnectMaxChars?: number;
};

export type DraftStep = {
  sequenceNo: number;
  channel: Channel;
  subject: string | null;
  body: string | null;
  callScript: string | null;
  assigneeId: string;
  /** null while a trigger-based track waits */
  date: IsoDate | null;
  originalDate: IsoDate | null;
  offsetWorkingDays: number | null;
  /** "Moved from 2026-11-11 (prospect holiday)" when the app changed Claude's date */
  movedNote: string | null;
};

type WorkingStep = DraftStep & { moveReasons: string[] };

export type DraftTrack = {
  contactId: string;
  persona: string;
  goal: string;
  rationale: string;
  assigneeId: string;
  trigger: {
    type: "fixed" | "after_reply" | "after_step";
    startDate: IsoDate | null;
    fromContactId: string | null;
    stepIndex: number | null;
    delayWorkingDays: number | null;
  };
  steps: DraftStep[];
};

export type Finding = { text: string; contactId?: string; sequenceNo?: number };

export type ValidatedCampaign = {
  tracks: DraftTrack[];
  blocking: Finding[];
  notes: Finding[];
  skipped: Array<{ contactRef: string; reason: string }>;
};

const TOKEN_RE = /\{[a-z_ ]+\}|\[(first name|name|company|title)\]/i;
const MIN_GAP_WORKING_DAYS = 2;

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export function copyIssues(channel: Channel, subject: string | null, body: string | null, limits: { emailWords: number; connectChars: number }): string[] {
  const issues: string[] = [];
  const text = `${subject ?? ""}\n${body ?? ""}`;
  if (TOKEN_RE.test(text)) issues.push("has an unresolved placeholder like {first_name}");
  if (text.includes("—")) issues.push("contains an em dash");
  if (channel === "linkedin_connect" && (body ?? "").length > limits.connectChars) {
    issues.push(`connect note is ${(body ?? "").length} characters (max ${limits.connectChars})`);
  }
  if (channel === "email") {
    const w = wordCount(body ?? "");
    if (w > limits.emailWords) issues.push(`email is ${w} words (flag above ${limits.emailWords})`);
    if (!subject?.trim()) issues.push("email has no subject");
  }
  if (channel !== "call" && !body?.trim()) issues.push("has no copy");
  return issues;
}

export function validateCampaign(out: CampaignOutput, input: ValidationInput): ValidatedCampaign {
  const blocking: Finding[] = [];
  const notes: Finding[] = [];
  const limits = { emailWords: input.emailWordFlag ?? 150, connectChars: input.linkedinConnectMaxChars ?? 300 };

  const byId = new Map(input.contacts.map((c) => [c.id, c]));
  const byEmail = new Map(input.contacts.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]));
  const resolveContact = (ref: string | null) => (ref ? (byId.get(ref.trim()) ?? byEmail.get(ref.trim().toLowerCase()) ?? null) : null);
  const userByKey = new Map(input.users.filter((u) => u.active).map((u) => [u.key.toLowerCase(), u]));

  for (const f of out.review.flags) blocking.push({ text: f });

  const tracks: Array<Omit<DraftTrack, "steps"> & { steps: WorkingStep[] }> = [];
  const seenContacts = new Set<string>();

  for (const tr of out.tracks) {
    const contact = resolveContact(tr.contact_ref);
    if (!contact) {
      blocking.push({ text: `Claude wrote a track for "${tr.contact_ref}", who is not a contact on this account. The track was left out.` });
      continue;
    }
    if (seenContacts.has(contact.id)) {
      blocking.push({ text: `Claude wrote two tracks for the same contact; the second was left out.`, contactId: contact.id });
      continue;
    }
    if (contact.excluded || contact.doNotContact) {
      notes.push({ text: `Left out a track for an excluded or do-not-contact person.`, contactId: contact.id });
      continue;
    }
    seenContacts.add(contact.id);

    let assignee = userByKey.get(tr.assignee.trim().toLowerCase());
    if (!assignee) {
      assignee = input.users.find((u) => u.id === input.ownerId)!;
      blocking.push({ text: `Assignee "${tr.assignee}" is not an active user; the track was given to the owner.`, contactId: contact.id });
    }

    const trig = tr.start_trigger;
    const fromContact = trig.type === "fixed" ? null : resolveContact(trig.from_contact);
    if (trig.type !== "fixed" && !fromContact) {
      blocking.push({ text: `This track waits on "${trig.from_contact}", who is not on the account. Pick a trigger or a fixed start.`, contactId: contact.id });
    }

    const steps: WorkingStep[] = [];
    let prevDate: IsoDate | null = null;
    let sawConnect = false;
    const scope = { country: contact.country, assigneeId: assignee.id };

    tr.steps.forEach((s, i) => {
      const seq = i + 1;
      for (const issue of copyIssues(s.channel, s.subject, s.body, limits)) {
        blocking.push({ text: `Step ${seq} ${issue}.`, contactId: contact.id, sequenceNo: seq });
      }
      if ((s.channel === "email" && !contact.hasEmail) || (s.channel.startsWith("linkedin") && !contact.hasLinkedIn)) {
        blocking.push({ text: `Step ${seq} is ${s.channel.replace("_", " ")} but this contact has no ${s.channel === "email" ? "email" : "LinkedIn URL"}.`, contactId: contact.id, sequenceNo: seq });
      }
      if (s.channel === "linkedin_connect") sawConnect = true;
      if (s.channel === "linkedin_message" && !sawConnect) {
        blocking.push({ text: `Step ${seq} is a LinkedIn message before any connect request.`, contactId: contact.id, sequenceNo: seq });
      }

      const step: WorkingStep = {
        sequenceNo: seq,
        channel: s.channel,
        subject: s.subject,
        body: s.body,
        callScript: s.call_script,
        assigneeId: assignee!.id,
        date: null,
        originalDate: null,
        offsetWorkingDays: null,
        movedNote: null,
        moveReasons: [],
      };

      if (trig.type === "fixed") {
        let proposed: IsoDate | null = s.date && isIsoDate(s.date) ? s.date : null;
        if (!proposed && s.offset_working_days !== null && trig.date && isIsoDate(trig.date)) {
          proposed = addWorkingDays(trig.date, Math.max(0, s.offset_working_days), scope, input.ctx);
        }
        if (!proposed) {
          blocking.push({ text: `Step ${seq} has no usable date and was left out.`, contactId: contact.id, sequenceNo: seq });
          return;
        }
        step.originalDate = proposed;
        let date = proposed < input.campaignStartDate ? input.campaignStartDate : proposed;
        const rolled = rollForward(date, scope, input.ctx);
        date = rolled.date;
        if (prevDate) {
          const earliest = addWorkingDays(prevDate, MIN_GAP_WORKING_DAYS, scope, input.ctx);
          if (date < earliest) date = earliest;
        }
        if (proposed < input.campaignStartDate) step.moveReasons.push("before the start date");
        step.moveReasons.push(...rolled.reasons.map((r) => INVALID_REASON_COPY[r]));
        if (date !== rolled.date) step.moveReasons.push("too close to the previous touch");
        step.date = date;
        prevDate = date;
      } else {
        step.offsetWorkingDays = s.offset_working_days ?? (i === 0 ? 0 : MIN_GAP_WORKING_DAYS * i);
      }
      steps.push(step);
    });

    tracks.push({
      contactId: contact.id,
      persona: tr.persona,
      goal: tr.track_goal,
      rationale: tr.rationale,
      assigneeId: assignee.id,
      trigger: {
        type: trig.type,
        startDate: trig.type === "fixed" ? (steps.find((s) => s.date)?.date ?? null) : null,
        fromContactId: fromContact?.id ?? null,
        stepIndex: trig.step_index,
        delayWorkingDays: trig.delay_working_days ?? (trig.type === "fixed" ? null : 2),
      },
      steps,
    });
  }

  // Caps and the collision guard across the whole draft plus everything already scheduled.
  const dated = tracks.flatMap((t) =>
    t.steps.filter((s) => s.date).map((s) => ({ t, s, touch: {
      key: `${t.contactId}#${s.sequenceNo}`,
      date: s.date!,
      contactId: t.contactId,
      accountId: input.accountId,
      assigneeId: s.assigneeId,
      channel: s.channel,
      country: byId.get(t.contactId)?.country ?? null,
    } satisfies Touch })),
  );
  const { scheduled, warnings } = scheduleTouches(dated.map((d) => d.touch), input.existingTouches, input.caps, input.ctx);
  scheduled.forEach((sch, i) => {
    const { s } = dated[i];
    if (sch.date !== s.date) {
      s.moveReasons.push(...sch.reasons.map((r) => MOVE_REASON_COPY[r]));
      s.date = sch.date;
    }
  });
  for (const t of tracks) {
    // Keep each track's dates in order, with the minimum gap, after the guard moved any of them.
    let prev: IsoDate | null = null;
    for (const s of t.steps) {
      if (!s.date) continue;
      if (prev) {
        const scope = { country: byId.get(t.contactId)?.country ?? null, assigneeId: s.assigneeId };
        const earliest = addWorkingDays(prev, MIN_GAP_WORKING_DAYS, scope, input.ctx);
        if (s.date < earliest) {
          s.date = earliest;
          s.moveReasons.push("kept the gap after an earlier step moved");
        }
      }
      prev = s.date;
      if (s.originalDate && s.date !== s.originalDate) {
        s.movedNote = `Moved from ${s.originalDate} (${[...new Set(s.moveReasons)].join(", ") || "rescheduled"})`;
        notes.push({ text: `Step ${s.sequenceNo}: ${s.movedNote}.`, contactId: t.contactId, sequenceNo: s.sequenceNo });
      }
    }
    if (t.trigger.type === "fixed") t.trigger.startDate = t.steps.find((s) => s.date)?.date ?? null;
  }
  for (const w of warnings) {
    notes.push({ text: `LinkedIn invites for the week of ${w.week}: ${w.connects} of ${w.cap}.` });
  }

  if (!tracks.length) blocking.push({ text: "The plan has no usable tracks. Regenerate or add tracks by hand." });

  return {
    tracks: tracks.map((t) => ({ ...t, steps: t.steps.map(({ moveReasons, ...rest }) => (void moveReasons, rest)) })),
    blocking,
    notes,
    skipped: out.skipped_contacts.map((s) => ({ contactRef: s.contact_ref, reason: s.reason })),
  };
}
