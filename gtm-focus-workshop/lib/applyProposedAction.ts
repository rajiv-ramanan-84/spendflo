'use client';

// Applies an accepted AI ProposedAction using the exact same write functions a human
// interaction would use (lib/data.ts) - there is no separate privileged AI write path.

import type { ProposedAction } from './types';
import {
  createCard,
  updateCard,
  createThesis,
  upsertThesisScore,
  recordDecision,
  createExperiment,
  setActivePhase,
  addChatMessage,
} from './data';

export async function applyProposedAction(
  workshopId: string,
  activePhaseId: string,
  actorId: string,
  action: ProposedAction
): Promise<void> {
  const p = action.payload as any;
  switch (action.kind) {
    case 'create_card':
      await createCard({
        workshopId,
        phaseId: p.phaseId ?? activePhaseId,
        type: p.type,
        title: p.title,
        body: p.body,
        authorId: actorId,
        x: p.x,
        y: p.y,
      });
      return;
    case 'update_card':
      await updateCard(p.cardId, p, actorId);
      return;
    case 'link_evidence_to_card': {
      const current = p.currentSourceIds ?? [];
      await updateCard(p.cardId, { sourceIds: Array.from(new Set([...current, p.evidenceId])) }, actorId);
      return;
    }
    case 'suggest_cluster':
      if (Array.isArray(p.cardIds) && p.clusterId) {
        for (const cardId of p.cardIds) {
          await updateCard(cardId, { clusterId: p.clusterId }, actorId);
        }
      }
      return;
    case 'start_vote':
      // Voting itself happens per-card via the UI; recorded here as a system note.
      await addChatMessage({
        workshopId,
        channel: 'facilitator',
        role: 'assistant',
        content: `Vote started: ${p.prompt ?? 'Vote on the highlighted cards.'}`,
      });
      return;
    case 'summarize_evidence':
      await addChatMessage({
        workshopId,
        channel: 'evidence_coach',
        role: 'assistant',
        content: p.summary ?? 'Evidence summary.',
      });
      return;
    case 'create_thesis':
      await createThesis({
        workshopId,
        name: p.name,
        segmentCardId: p.segmentCardId,
        personaCardId: p.personaCardId,
        problemCardId: p.problemCardId,
        capabilityCardId: p.capabilityCardId,
        outcomeCardId: p.outcomeCardId,
        summary: p.summary,
      });
      return;
    case 'update_thesis_score':
      await upsertThesisScore({
        thesisId: p.thesisId,
        dimension: p.dimension,
        score: p.score,
        rationale: p.rationale,
        evidenceIds: p.evidenceIds,
      });
      return;
    case 'record_decision':
      await recordDecision({
        workshopId,
        thesisId: p.thesisId,
        type: p.type,
        rationale: p.rationale,
        decidedBy: actorId,
      });
      return;
    case 'create_experiment':
      await createExperiment({
        workshopId,
        thesisId: p.thesisId,
        hypothesis: p.hypothesis,
        owner: p.owner,
        deadline: p.deadline,
        targetSegmentPersona: p.targetSegmentPersona,
        smallestTest: p.smallestTest,
        evidenceToCollect: p.evidenceToCollect,
        successThreshold: p.successThreshold,
        killReviseThreshold: p.killReviseThreshold,
      });
      return;
    case 'advance_phase':
      await setActivePhase(workshopId, p.phaseId);
      return;
    default:
      throw new Error(`Unknown proposed action kind: ${(action as any).kind}`);
  }
}
