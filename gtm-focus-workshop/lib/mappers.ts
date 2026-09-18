// Convert between Postgres snake_case rows and the app's camelCase TS types.
import type {
  Card,
  Evidence,
  GTMThesis,
  ThesisScore,
  Decision,
  Experiment,
  Vote,
  Comment,
  Participant,
  Workshop,
  ChatMessage,
  AIProposal,
} from './types';

export function rowToCard(r: any): Card {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    phaseId: r.phase_id,
    type: r.type,
    title: r.title,
    body: r.body ?? undefined,
    authorId: r.author_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    color: r.color,
    evidenceGrade: r.evidence_grade ?? undefined,
    confidence: r.confidence ?? undefined,
    x: Number(r.x) || 0,
    y: Number(r.y) || 0,
    clusterId: r.cluster_id ?? undefined,
    thesisId: r.thesis_id ?? undefined,
    sourceIds: r.source_ids ?? [],
    voteCount: r.vote_count ?? 0,
    status: r.status,
    lastEditedBy: r.last_edited_by ?? undefined,
  };
}

export function cardToRow(c: Partial<Card>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (c.workshopId !== undefined) row.workshop_id = c.workshopId;
  if (c.phaseId !== undefined) row.phase_id = c.phaseId;
  if (c.type !== undefined) row.type = c.type;
  if (c.title !== undefined) row.title = c.title;
  if (c.body !== undefined) row.body = c.body;
  if (c.authorId !== undefined) row.author_id = c.authorId;
  if (c.color !== undefined) row.color = c.color;
  if (c.evidenceGrade !== undefined) row.evidence_grade = c.evidenceGrade;
  if (c.confidence !== undefined) row.confidence = c.confidence;
  if (c.x !== undefined) row.x = c.x;
  if (c.y !== undefined) row.y = c.y;
  if (c.clusterId !== undefined) row.cluster_id = c.clusterId;
  if (c.thesisId !== undefined) row.thesis_id = c.thesisId;
  if (c.sourceIds !== undefined) row.source_ids = c.sourceIds;
  if (c.voteCount !== undefined) row.vote_count = c.voteCount;
  if (c.status !== undefined) row.status = c.status;
  if (c.lastEditedBy !== undefined) row.last_edited_by = c.lastEditedBy;
  row.updated_at = new Date().toISOString();
  return row;
}

export function rowToEvidence(r: any): Evidence {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    type: r.type,
    title: r.title,
    excerpt: r.excerpt ?? undefined,
    externalUrl: r.external_url ?? undefined,
    sourceSystem: r.source_system ?? undefined,
    accountName: r.account_name ?? undefined,
    owner: r.owner ?? undefined,
    date: r.date ?? undefined,
    whatItProves: r.what_it_proves,
    limitations: r.limitations ?? undefined,
    createdBy: r.created_by,
    createdAt: r.created_at,
    cardId: r.card_id ?? undefined,
  };
}

export function evidenceToRow(e: Partial<Evidence>): Record<string, unknown> {
  return {
    workshop_id: e.workshopId,
    card_id: e.cardId ?? null,
    type: e.type,
    title: e.title,
    excerpt: e.excerpt ?? null,
    external_url: e.externalUrl ?? null,
    source_system: e.sourceSystem ?? 'manual',
    account_name: e.accountName ?? null,
    owner: e.owner ?? null,
    date: e.date ?? null,
    what_it_proves: e.whatItProves,
    limitations: e.limitations ?? null,
    created_by: e.createdBy,
  };
}

export function rowToThesis(r: any): GTMThesis {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    name: r.name,
    segmentCardId: r.segment_card_id ?? undefined,
    personaCardId: r.persona_card_id ?? undefined,
    problemCardId: r.problem_card_id ?? undefined,
    capabilityCardId: r.capability_card_id ?? undefined,
    outcomeCardId: r.outcome_card_id ?? undefined,
    summary: r.summary ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function thesisToRow(t: Partial<GTMThesis>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.workshopId !== undefined) row.workshop_id = t.workshopId;
  if (t.name !== undefined) row.name = t.name;
  if (t.segmentCardId !== undefined) row.segment_card_id = t.segmentCardId;
  if (t.personaCardId !== undefined) row.persona_card_id = t.personaCardId;
  if (t.problemCardId !== undefined) row.problem_card_id = t.problemCardId;
  if (t.capabilityCardId !== undefined) row.capability_card_id = t.capabilityCardId;
  if (t.outcomeCardId !== undefined) row.outcome_card_id = t.outcomeCardId;
  if (t.summary !== undefined) row.summary = t.summary;
  row.updated_at = new Date().toISOString();
  return row;
}

export function rowToThesisScore(r: any): ThesisScore {
  return {
    id: r.id,
    thesisId: r.thesis_id,
    dimension: r.dimension,
    score: r.score,
    rationale: r.rationale ?? undefined,
    evidenceIds: r.evidence_ids ?? [],
    updatedAt: r.updated_at,
  };
}

export function rowToDecision(r: any): Decision {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    thesisId: r.thesis_id,
    type: r.type,
    rationale: r.rationale ?? undefined,
    decidedBy: r.decided_by,
    createdAt: r.created_at,
  };
}

export function rowToExperiment(r: any): Experiment {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    thesisId: r.thesis_id,
    hypothesis: r.hypothesis,
    owner: r.owner,
    deadline: r.deadline ?? undefined,
    targetSegmentPersona: r.target_segment_persona ?? undefined,
    smallestTest: r.smallest_test,
    evidenceToCollect: r.evidence_to_collect,
    successThreshold: r.success_threshold,
    killReviseThreshold: r.kill_revise_threshold,
    createdAt: r.created_at,
  };
}

export function rowToVote(r: any): Vote {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    cardId: r.card_id,
    participantId: r.participant_id,
    createdAt: r.created_at,
  };
}

export function rowToComment(r: any): Comment {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    cardId: r.card_id,
    authorId: r.author_id,
    body: r.body,
    createdAt: r.created_at,
  };
}

export function rowToParticipant(r: any): Participant {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    name: r.name,
    role: r.role,
    inviteToken: r.invite_token,
    createdAt: r.created_at,
  };
}

export function rowToWorkshop(r: any): Workshop {
  return {
    id: r.id,
    name: r.name,
    goal: r.goal,
    companyContext: r.company_context,
    activePhase: r.active_phase,
    phaseStartedAt: r.phase_started_at ?? undefined,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export function rowToChatMessage(r: any): ChatMessage {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    channel: r.channel,
    role: r.role,
    authorName: r.author_name ?? undefined,
    content: r.content,
    createdAt: r.created_at,
  };
}

export function rowToProposal(r: any): AIProposal {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    channel: r.channel,
    actions: r.actions ?? [],
    status: r.status,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}
