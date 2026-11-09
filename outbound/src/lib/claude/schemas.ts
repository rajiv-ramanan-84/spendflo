import { z } from "zod";

/**
 * Output contracts for the three calls in flo-campaign-engine (the skill file
 * is the source of truth). Optional fields are nullable rather than omitted so
 * the API's structured-output mode can enforce the exact shape; the app then
 * validates the meaning (dates, contacts, caps) in validate.ts.
 */

export const CHANNELS = ["email", "linkedin_connect", "linkedin_message", "linkedin_inmail", "call", "other"] as const;
export const PERSONAS = ["economic_buyer", "procurement_leader", "system_owner", "contract_manager", "legal", "finance_ap", "champion", "other"] as const;
export const CLASSIFICATIONS = ["positive", "neutral", "objection", "not_now", "referral", "wrong_person", "unsubscribe", "auto_reply", "bounce"] as const;

export const StepSchema = z.object({
  date: z.string().nullable().describe("YYYY-MM-DD from valid_working_dates; null on trigger-based tracks"),
  offset_working_days: z.number().int().nullable().describe("Trigger-based tracks only: working days after the trigger fires"),
  channel: z.enum(CHANNELS),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  call_script: z.string().nullable(),
  keep_from_previous: z.boolean(),
});

export const StartTriggerSchema = z.object({
  type: z.enum(["fixed", "after_reply", "after_step"]),
  date: z.string().nullable(),
  from_contact: z.string().nullable(),
  step_index: z.number().int().nullable(),
  delay_working_days: z.number().int().nullable(),
});

export const TrackSchema = z.object({
  contact_ref: z.string(),
  persona: z.enum(PERSONAS),
  track_goal: z.string(),
  start_trigger: StartTriggerSchema,
  assignee: z.string(),
  rationale: z.string(),
  steps: z.array(StepSchema),
});

export const CampaignSchema = z.object({
  campaign_name: z.string(),
  objective: z.string(),
  job: z.enum(["redlining", "renewals", "guided_buying", "other"]),
  icp_profile: z.enum(["A", "B", "C"]),
  angle: z.string(),
  rationale: z.string(),
  generated_on: z.string(),
  change_summary: z.string().nullable(),
  tracks: z.array(TrackSchema),
  skipped_contacts: z.array(z.object({ contact_ref: z.string(), reason: z.string() })),
  discovery_questions: z.array(z.string()),
  review: z.object({
    likely_reply: z.enum(["high", "medium", "low"]),
    main_weakness: z.string(),
    flags: z.array(z.string()),
  }),
});

export const ClassifySchema = z.object({
  classification: z.enum(CLASSIFICATIONS),
  confidence: z.number(),
  summary: z.string(),
  return_date: z.string().nullable(),
  referred_to: z.string().nullable(),
  suggested_next_step: z.string(),
});

export type CampaignOutput = z.infer<typeof CampaignSchema>;
export type TrackOutput = z.infer<typeof TrackSchema>;
export type StepOutput = z.infer<typeof StepSchema>;
export type ClassifyOutput = z.infer<typeof ClassifySchema>;
export type Channel = (typeof CHANNELS)[number];
export type Classification = (typeof CLASSIFICATIONS)[number];

/** Below this confidence a detected reply shows as Needs review (PRD M10). */
export const CLASSIFY_REVIEW_THRESHOLD = 0.7;
