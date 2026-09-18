'use client';

// Thin client-side data access layer over Supabase. All writes go through here so the
// AI-proposal "Accept" path and normal user interactions share the exact same code
// path (per spec: AI never gets a separate privileged write path).

import { getSupabaseBrowserClient } from './supabaseClient';
import {
  rowToCard,
  cardToRow,
  rowToEvidence,
  evidenceToRow,
  rowToThesis,
  thesisToRow,
  rowToThesisScore,
  rowToDecision,
  rowToExperiment,
  rowToVote,
  rowToComment,
  rowToParticipant,
  rowToWorkshop,
  rowToChatMessage,
  rowToProposal,
} from './mappers';
import type {
  Card,
  CardType,
  Evidence,
  GTMThesis,
  ThesisScore,
  ThesisDimension,
  Decision,
  DecisionType,
  Experiment,
  Participant,
  Workshop,
  ChatMessage,
  AIProposal,
  PhaseKey,
} from './types';
import { PHASES } from './types';

async function must<T>(promise: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('No data returned');
  return data;
}

// ---------- Workshops ----------

export async function createWorkshop(input: { name: string; goal: string; companyContext: string; createdBy: string }): Promise<Workshop> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(
    sb
      .from('workshops')
      .insert({ name: input.name, goal: input.goal, company_context: input.companyContext, created_by: input.createdBy })
      .select()
      .single()
  );
  await sb.from('phases').insert(
    PHASES.map((p) => ({ id: p.id, workshop_id: row.id, index: p.index, name: p.name, prompt: p.prompt, minutes: p.minutes }))
  );
  return rowToWorkshop(row);
}

export async function getWorkshop(workshopId: string): Promise<Workshop | null> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('workshops').select().eq('id', workshopId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToWorkshop(data) : null;
}

export async function setActivePhase(workshopId: string, phase: PhaseKey): Promise<void> {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb
    .from('workshops')
    .update({ active_phase: phase, phase_started_at: new Date().toISOString() })
    .eq('id', workshopId);
  if (error) throw new Error(error.message);
}

// ---------- Participants ----------

export async function joinWorkshop(workshopId: string, name: string, role: 'facilitator' | 'participant'): Promise<Participant> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(
    sb.from('participants').insert({ workshop_id: workshopId, name, role }).select().single()
  );
  return rowToParticipant(row);
}

export async function listParticipants(workshopId: string): Promise<Participant[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('participants').select().eq('workshop_id', workshopId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToParticipant);
}

// ---------- Cards ----------

export async function listCards(workshopId: string): Promise<Card[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('cards').select().eq('workshop_id', workshopId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToCard);
}

export async function createCard(input: {
  workshopId: string;
  phaseId: string;
  type: CardType;
  title: string;
  body?: string;
  authorId: string;
  x?: number;
  y?: number;
}): Promise<Card> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(
    sb
      .from('cards')
      .insert(
        cardToRow({
          workshopId: input.workshopId,
          phaseId: input.phaseId,
          type: input.type,
          title: input.title,
          body: input.body,
          authorId: input.authorId,
          color: 'uncertain',
          x: input.x ?? Math.random() * 600,
          y: input.y ?? Math.random() * 400,
          sourceIds: [],
          voteCount: 0,
          status: 'draft',
        })
      )
      .select()
      .single()
  );
  return rowToCard(row);
}

export async function updateCard(cardId: string, patch: Partial<Card>, editorId?: string): Promise<Card> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(
    sb
      .from('cards')
      .update(cardToRow({ ...patch, lastEditedBy: editorId ?? patch.lastEditedBy }))
      .eq('id', cardId)
      .select()
      .single()
  );
  return rowToCard(row);
}

export async function moveCard(cardId: string, x: number, y: number, editorId?: string): Promise<void> {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb
    .from('cards')
    .update({ x, y, updated_at: new Date().toISOString(), last_edited_by: editorId ?? null })
    .eq('id', cardId);
  if (error) throw new Error(error.message);
}

export async function deleteCard(cardId: string): Promise<void> {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('cards').delete().eq('id', cardId);
  if (error) throw new Error(error.message);
}

export async function voteCard(cardId: string, workshopId: string, participantId: string): Promise<void> {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('votes').insert({ workshop_id: workshopId, card_id: cardId, participant_id: participantId });
  if (error && !error.message.includes('duplicate')) throw new Error(error.message);
  const { count } = await sb.from('votes').select('id', { count: 'exact', head: true }).eq('card_id', cardId);
  await sb.from('cards').update({ vote_count: count ?? 0 }).eq('id', cardId);
}

export async function listCardComments(cardId: string) {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('comments').select().eq('card_id', cardId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToComment);
}

export async function addComment(workshopId: string, cardId: string, authorId: string, body: string) {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(
    sb.from('comments').insert({ workshop_id: workshopId, card_id: cardId, author_id: authorId, body }).select().single()
  );
  return rowToComment(row);
}

// ---------- Evidence ----------

export async function listEvidence(workshopId: string): Promise<Evidence[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('evidence').select().eq('workshop_id', workshopId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToEvidence);
}

export async function createEvidence(input: Omit<Evidence, 'id' | 'createdAt'>): Promise<Evidence> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(sb.from('evidence').insert(evidenceToRow(input)).select().single());
  return rowToEvidence(row);
}

// ---------- Theses ----------

export async function listTheses(workshopId: string): Promise<GTMThesis[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('gtm_theses').select().eq('workshop_id', workshopId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToThesis);
}

export async function getThesis(thesisId: string): Promise<GTMThesis | null> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('gtm_theses').select().eq('id', thesisId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToThesis(data) : null;
}

export async function createThesis(input: Omit<GTMThesis, 'id' | 'createdAt' | 'updatedAt'>): Promise<GTMThesis> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(sb.from('gtm_theses').insert(thesisToRow(input)).select().single());
  return rowToThesis(row);
}

export async function updateThesis(thesisId: string, patch: Partial<GTMThesis>): Promise<GTMThesis> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(sb.from('gtm_theses').update(thesisToRow(patch)).eq('id', thesisId).select().single());
  return rowToThesis(row);
}

export async function listThesisScores(thesisId: string): Promise<ThesisScore[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('thesis_scores').select().eq('thesis_id', thesisId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToThesisScore);
}

export async function upsertThesisScore(input: {
  thesisId: string;
  dimension: ThesisDimension;
  score: number;
  rationale?: string;
  evidenceIds?: string[];
}): Promise<ThesisScore> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(
    sb
      .from('thesis_scores')
      .upsert(
        {
          thesis_id: input.thesisId,
          dimension: input.dimension,
          score: input.score,
          rationale: input.rationale ?? null,
          evidence_ids: input.evidenceIds ?? [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'thesis_id,dimension' }
      )
      .select()
      .single()
  );
  return rowToThesisScore(row);
}

// ---------- Decisions & experiments ----------

export async function listDecisions(workshopId: string): Promise<Decision[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('decisions').select().eq('workshop_id', workshopId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToDecision);
}

export async function recordDecision(input: {
  workshopId: string;
  thesisId: string;
  type: DecisionType;
  rationale?: string;
  decidedBy: string;
}): Promise<Decision> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(
    sb
      .from('decisions')
      .insert({
        workshop_id: input.workshopId,
        thesis_id: input.thesisId,
        type: input.type,
        rationale: input.rationale ?? null,
        decided_by: input.decidedBy,
      })
      .select()
      .single()
  );
  return rowToDecision(row);
}

export async function listExperiments(workshopId: string): Promise<Experiment[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('experiments').select().eq('workshop_id', workshopId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToExperiment);
}

export async function createExperiment(input: Omit<Experiment, 'id' | 'createdAt'>): Promise<Experiment> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(
    sb
      .from('experiments')
      .insert({
        workshop_id: input.workshopId,
        thesis_id: input.thesisId,
        hypothesis: input.hypothesis,
        owner: input.owner,
        deadline: input.deadline ?? null,
        target_segment_persona: input.targetSegmentPersona ?? null,
        smallest_test: input.smallestTest,
        evidence_to_collect: input.evidenceToCollect,
        success_threshold: input.successThreshold,
        kill_revise_threshold: input.killReviseThreshold,
      })
      .select()
      .single()
  );
  return rowToExperiment(row);
}

// ---------- Chat & AI proposals ----------

export async function listChatMessages(workshopId: string, channel: 'facilitator' | 'evidence_coach'): Promise<ChatMessage[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb
    .from('chat_messages')
    .select()
    .eq('workshop_id', workshopId)
    .eq('channel', channel)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToChatMessage);
}

export async function addChatMessage(input: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(
    sb
      .from('chat_messages')
      .insert({
        workshop_id: input.workshopId,
        channel: input.channel,
        role: input.role,
        author_name: input.authorName ?? null,
        content: input.content,
      })
      .select()
      .single()
  );
  return rowToChatMessage(row);
}

export async function listProposals(workshopId: string): Promise<AIProposal[]> {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from('ai_proposals').select().eq('workshop_id', workshopId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToProposal);
}

export async function createProposal(input: Omit<AIProposal, 'id' | 'createdAt' | 'status'>): Promise<AIProposal> {
  const sb = getSupabaseBrowserClient();
  const row = await must<any>(
    sb
      .from('ai_proposals')
      .insert({
        workshop_id: input.workshopId,
        channel: input.channel,
        actions: input.actions,
        created_by: input.createdBy,
      })
      .select()
      .single()
  );
  return rowToProposal(row);
}

export async function setProposalStatus(proposalId: string, status: AIProposal['status']): Promise<void> {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('ai_proposals').update({ status }).eq('id', proposalId);
  if (error) throw new Error(error.message);
}

// ---------- Audit log ----------

export async function logAudit(input: {
  workshopId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const sb = getSupabaseBrowserClient();
  await sb.from('audit_log').insert({
    workshop_id: input.workshopId,
    actor_id: input.actorId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    detail: input.detail ?? null,
  });
}
