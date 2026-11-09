import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaude } from "@/lib/claude/client";
import { buildGeneratePayload, type PayloadAccount, contactRefs, namesForRefs } from "@/lib/claude/payload";
import { CampaignSchema, type CampaignOutput } from "@/lib/claude/schemas";
import { validateCampaign, type ValidatedCampaign } from "@/lib/claude/validate";
import { logActivity } from "@/lib/activity/log";
import { playForAccount, playPayload } from "@/lib/playbook/payload";
import type { PlayResult } from "@/lib/playbook/gate";
import { PLAY_JOB, PLAY_SHORT, type PlayCode } from "@/lib/playbook/catalog";
import { loadPlanningContext, loadScheduledTouches, planningWindow, teamLoadPayload, teamPayload, type PlanningContext } from "./context";

/**
 * Generate campaign (PRD M3): account + contacts -> Claude -> validated draft.
 * The draft is saved with status Draft. Nothing launches without the owner.
 */

export type GenerateResult =
  | { ok: true; campaignId: string; blocking: number; notes: number; callId: string }
  | { ok: false; error: string; callId: string | null; retryable: boolean };

const OPEN_STATUSES = ["draft", "active", "paused", "responded", "meeting_booked"];

async function loadAccount(db: SupabaseClient, accountId: string) {
  const { data: account, error } = await db.from("accounts").select("*").eq("id", accountId).single();
  if (error || !account) throw new Error("Account not found");
  const { data: contacts } = await db
    .from("contacts")
    .select("id, full_name, title, persona, email, email_status, linkedin_url, phone, country, notes, linkedin_signals, exclude, do_not_contact, bounced, sheet_deleted_at")
    .eq("account_id", accountId)
    .is("deleted_at", null);
  return { account, contacts: (contacts ?? []).filter((c) => !c.sheet_deleted_at) };
}

type Prepared = {
  p: PlanningContext;
  account: Record<string, unknown> & { id: string; tier: string | null; owner_id: string | null };
  contacts: Awaited<ReturnType<typeof loadAccount>>["contacts"];
  drafts: string[];
  owner: PlanningContext["users"][number];
  win: ReturnType<typeof planningWindow>;
  touches: Awaited<ReturnType<typeof loadScheduledTouches>>;
  model: string;
  refs: ReturnType<typeof contactRefs>;
  payload: ReturnType<typeof buildGeneratePayload>;
  /** The play and level the signals earned, applied before Claude is called. */
  play: PlayResult;
};

/** Everything up to the Claude call: checks, planning window, payload. Shared by live and overnight drafts. */
export async function prepareGenerate(
  db: SupabaseClient,
  opts: { accountId: string; ownerNotes?: string | null; refIds?: string[]; forcePlay?: PlayCode | null },
): Promise<{ ok: true; prep: Prepared } | { ok: false; error: string; retryable: false }> {
  const p = await loadPlanningContext(db);
  if (!p.skill.text) return { ok: false, error: "No campaign skill is set. Upload it in Settings > Claude.", retryable: false };

  const { account, contacts } = await loadAccount(db, opts.accountId);
  if (account.archived || account.do_not_contact) return { ok: false, error: "This account is archived or marked do not contact.", retryable: false };

  const { data: open } = await db.from("campaigns").select("id, status").eq("account_id", account.id).is("deleted_at", null).in("status", OPEN_STATUSES);
  if ((open ?? []).some((c) => c.status !== "draft")) return { ok: false, error: "This account already has a live campaign. Use Re-plan instead.", retryable: false };

  const owner = p.users.find((u) => u.id === account.owner_id);
  if (!owner) return { ok: false, error: "Assign an owner before generating a campaign.", retryable: false };

  const usable = contacts.filter((c) => !c.exclude && !c.do_not_contact && (c.email || c.linkedin_url));
  if (!usable.length) return { ok: false, error: "No usable contacts (each needs an email or LinkedIn URL and must not be excluded).", retryable: false };

  const win = planningWindow(p);
  const touches = await loadScheduledTouches(db, p.today);
  const model = account.tier === "A" ? p.settings.tier_a_model : p.settings.default_model;

  // Overnight drafts reuse the refs Claude saw when the batch was sent.
  const refs = contactRefs(opts.refIds ?? contacts.map((c) => c.id));
  const evaluated = playForAccount(account as { signals: string | null; outreach_angle: string | null; archived: boolean | null; icp_verdict: string | null; do_not_contact: boolean | null }, p.today);
  // No signal points anywhere: a person picks the play, so Claude never gets all three.
  const play: PlayResult = opts.forcePlay && !evaluated.play ? { ...evaluated, pointsTo: opts.forcePlay } : evaluated;
  const pp = playPayload(play);
  const payload = buildGeneratePayload({
    play: pp.play,
    signals: pp.signals,
    today: p.today,
    campaignStartDate: win.start,
    validWorkingDates: win.validWorkingDates,
    account: accountForPayload(account),
    contacts: contacts.map((c) => ({
      contact_id: refs.ref(c.id)!,
      name: c.full_name,
      title: c.title,
      persona: c.persona,
      email: c.bounced ? null : c.email,
      email_status: c.email_status,
      linkedin_url: c.linkedin_url,
      has_phone: !!c.phone,
      country: c.country,
      notes: c.notes,
      linkedin_signals: c.linkedin_signals ?? {},
      exclude: c.exclude,
      do_not_contact: c.do_not_contact,
    })),
    owner: owner.key,
    team: teamPayload(p, win.start, win.end),
    teamLoad: teamLoadPayload(p, touches),
    caps: p.caps,
    approvedProofPoints: p.proofPoints,
    ownerNotes: opts.ownerNotes ?? null,
  });
  return { ok: true, prep: { p, account, contacts, drafts: (open ?? []).filter((c) => c.status === "draft").map((c) => c.id), owner, win, touches, model, refs, payload, play } };
}

/** Validates Claude's plan against the calendar and caps, then saves it as a Draft. */
export async function finishGenerate(db: SupabaseClient, prep: Prepared, data: CampaignOutput, meta: { model: string; callId: string; requestedBy: string | null }) {
  const { p, account, contacts, owner, win, touches, refs, payload } = prep;
  const validated = validateCampaign(data, {
    accountId: account.id,
    ownerId: owner.id,
    contacts: contacts.map((c) => ({
      id: c.id,
      email: c.email,
      hasEmail: !!c.email && !c.bounced,
      hasLinkedIn: !!c.linkedin_url,
      country: c.country,
      excluded: c.exclude,
      doNotContact: c.do_not_contact,
      name: c.full_name,
    })),
    refs: refs.toId,
    activeCap: p.caps.active_contacts_per_account,
    users: p.users.map((u) => ({ id: u.id, key: u.key, active: u.active })),
    campaignStartDate: win.start,
    caps: p.caps,
    existingTouches: touches,
    ctx: p.ctx,
    emailWordFlag: p.settings.email_word_flag,
    linkedinConnectMaxChars: p.settings.linkedin_connect_max_chars,
  });

  // Regenerating replaces an earlier draft; history stays (soft delete).
  for (const id of prep.drafts) await db.from("campaigns").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  // Notes for people read better with names than with c1-style refs.
  const names = new Map(contacts.map((c) => [c.id, c.full_name as string]));
  const nm = <T extends string | null>(t: T) => namesForRefs(t, refs.toId, names) as T;
  const output = { ...data, rationale: nm(data.rationale), review: { ...data.review, likely_reply: nm(data.review.likely_reply), main_weakness: nm(data.review.main_weakness) } };
  const readable = { ...validated, blocking: validated.blocking.map((b) => ({ ...b, text: nm(b.text) })), notes: validated.notes.map((n) => ({ ...n, text: nm(n.text) })), tracks: validated.tracks.map((t) => ({ ...t, rationale: nm(t.rationale), goal: nm(t.goal) })) };
  // Vetting the draft against the gate: say so when Claude's job disagrees with the signals, or when there is no live trigger.
  const pr = prep.play;
  if (pr.play && data.job !== PLAY_JOB[pr.play]) readable.blocking.push({ text: `The signals point to ${PLAY_SHORT[pr.play]}, but this draft leads with ${data.job.replace("_", " ")}. Check which one you want to test.` });
  if (pr.level === "nurture") readable.blocking.push({ text: pr.stale.length ? `No signal in the last 90 days (the newest is ${pr.stale[0].ageDays} days old). This draft has no live trigger.` : "No dated signal on this account. This draft has no live trigger." });
  const campaignId = await saveDraft(db, { accountId: account.id, ownerId: owner.id, startDate: win.start, output, validated: readable, payload, model: meta.model, p, createdBy: meta.requestedBy, play: pr.play ?? pr.pointsTo, level: pr.level });
  await db.from("claude_calls").update({ campaign_id: campaignId }).eq("id", meta.callId);
  await logActivity(db, { entityType: "campaign", entityId: campaignId, action: "draft_generated", actorId: meta.requestedBy, after: { model: meta.model, blocking: validated.blocking.length } });
  return { campaignId, blocking: validated.blocking.length, notes: validated.notes.length };
}

export async function generateCampaign(
  db: SupabaseClient,
  opts: { accountId: string; requestedBy: string | null; ownerNotes?: string | null; callId?: string; forcePlay?: PlayCode | null },
): Promise<GenerateResult> {
  const ready = await prepareGenerate(db, opts);
  if (!ready.ok) return { ok: false, error: ready.error, callId: null, retryable: false };
  const { prep } = ready;

  const callId = await startCall(db, opts.callId, { account_id: prep.account.id, model: prep.model, skill_version_id: prep.p.skill.id, requested_by: opts.requestedBy });
  const started = Date.now();
  const res = await callClaude({ kind: "generate_campaign", model: prep.model, skillText: prep.p.skill.text, payload: prep.payload, schema: CampaignSchema, play: prep.play.play ?? prep.play.pointsTo ?? "all" });
  await finishCall(db, callId, res, Date.now() - started);
  if (!res.ok) return { ok: false, error: res.message, callId, retryable: res.reason !== "refusal" };

  const done = await finishGenerate(db, prep, res.data, { model: res.model, callId, requestedBy: opts.requestedBy });
  return { ok: true, callId, ...done };
}

export function accountForPayload(a: Record<string, unknown>): PayloadAccount {
  const s = (k: string) => (a[k] as string | null) ?? null;
  return {
    name: a.name as string,
    domain: s("domain"),
    tier: s("tier"),
    icp_verdict: s("icp_verdict"),
    hq: s("hq"),
    revenue: s("revenue"),
    employees: s("employees"),
    ownership: s("ownership"),
    coupa_evidence: s("coupa_evidence"),
    trigger: s("trigger"),
    trigger_date: s("trigger_date"),
    signals: s("signals"),
    disqualifier_flags: s("disqualifier_flags"),
    outreach_angle: s("outreach_angle"),
    target_contact_notes: s("target_contact_notes"),
    custom_fields: (a.custom_fields as Record<string, string>) ?? {},
  };
}

async function startCall(db: SupabaseClient, existingId: string | undefined, fields: Record<string, unknown>): Promise<string> {
  if (existingId) {
    await db.from("claude_calls").update({ ...fields, status: "running" }).eq("id", existingId);
    return existingId;
  }
  const { data, error } = await db.from("claude_calls").insert({ call_type: "generate_campaign", status: "running", ...fields }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function finishCall(db: SupabaseClient, id: string, res: Awaited<ReturnType<typeof callClaude>>, ms: number) {
  await db.from("claude_calls").update({
    status: res.ok ? "ok" : res.reason === "invalid" ? "invalid" : "failed",
    attempts: res.attempts,
    model: res.model,
    input_tokens: res.usage?.input ?? null,
    output_tokens: res.usage?.output ?? null,
    cache_read_tokens: res.usage?.cacheRead ?? null,
    cost_usd: res.usage?.costUsd ?? null,
    error: res.ok ? null : res.message,
    raw_output: res.rawText,
    duration_ms: ms,
  }).eq("id", id);
}

export type ReviewFlag = { id: string; text: string; contactId?: string; sequenceNo?: number };

export async function saveDraft(
  db: SupabaseClient,
  d: { accountId: string; ownerId: string; startDate: string; output: CampaignOutput; validated: ValidatedCampaign; payload: unknown; model: string; p: PlanningContext; createdBy: string | null; play?: string | null; level?: string | null },
): Promise<string> {
  const flags: ReviewFlag[] = d.validated.blocking.map((b, i) => ({ id: `f${i + 1}`, ...b }));
  const { data: campaign, error } = await db.from("campaigns").insert({
    account_id: d.accountId,
    owner_id: d.ownerId,
    name: d.output.campaign_name,
    objective: d.output.objective,
    angle: d.output.angle,
    job: d.output.job,
    play: d.play ?? null,
    play_level: d.level ?? null,
    icp_profile: d.output.icp_profile,
    rationale: d.output.rationale,
    discovery_questions: d.output.discovery_questions,
    review: { likely_reply: d.output.review.likely_reply, main_weakness: d.output.review.main_weakness, flags, notes: d.validated.notes, skipped: d.validated.skipped },
    review_flags_cleared: [],
    status: "draft",
    current_version: 1,
    start_date: d.startDate,
  }).select("id").single();
  if (error || !campaign) throw new Error(`Save draft: ${error?.message}`);

  try {
    await db.from("campaign_versions").insert({
      campaign_id: campaign.id, version_no: 1, created_by: d.createdBy, reason: "initial", scope: "campaign",
      claude_input: d.payload, claude_output: d.output, skill_version_id: d.p.skill.id, model: d.model,
    });
    await insertTracks(db, campaign.id, 1, d.validated);
    return campaign.id;
  } catch (e) {
    await db.from("campaigns").update({ deleted_at: new Date().toISOString() }).eq("id", campaign.id);
    throw e;
  }
}

export async function insertTracks(db: SupabaseClient, campaignId: string, versionNo: number, v: ValidatedCampaign) {
  for (const t of v.tracks) {
    const { data: track, error } = await db.from("contact_tracks").insert({
      campaign_id: campaignId,
      contact_id: t.contactId,
      persona: t.persona,
      track_goal: t.goal,
      rationale: t.rationale,
      start_trigger_type: t.trigger.type,
      trigger_from_contact_id: t.trigger.fromContactId,
      trigger_step_index: t.trigger.stepIndex,
      delay_working_days: t.trigger.delayWorkingDays,
      start_date: t.trigger.startDate,
      assignee_id: t.assigneeId,
      status: t.nurture ? "nurture" : "not_started",
      pause_reason: t.nurture ? "Over the account's active cap" : null,
      total_steps: t.steps.length,
      next_step_at: t.steps.find((s) => s.date)?.date ?? null,
    }).select("id").single();
    if (error || !track) throw new Error(`Save track: ${error?.message}`);
    if (!t.steps.length) continue;
    const { error: stepErr } = await db.from("steps").insert(t.steps.map((s) => ({
      campaign_id: campaignId,
      track_id: track.id,
      version_no: versionNo,
      sequence_no: s.sequenceNo,
      contact_id: t.contactId,
      assignee_id: s.assigneeId,
      channel: s.channel,
      scheduled_date: s.date,
      original_date: s.originalDate,
      due_date: s.date,
      moved_from_date: s.movedNote ? s.originalDate : null,
      moved_reason: s.movedNote,
      offset_working_days: s.offsetWorkingDays,
      subject: s.subject,
      body: s.body,
      original_body: s.body,
      call_script: s.callScript,
      status: "upcoming",
    })));
    if (stepErr) throw new Error(`Save steps: ${stepErr.message}`);
  }
}
