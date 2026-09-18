// Core domain types. These mirror supabase/schema.sql 1:1 - if you change one, change the other.

export type CardType =
  | 'segment'
  | 'persona'
  | 'customer_problem'
  | 'trigger_event'
  | 'customer_quote'
  | 'win'
  | 'loss'
  | 'outcome_value'
  | 'product_capability'
  | 'implementation_signal'
  | 'metric'
  | 'assumption'
  | 'open_question'
  | 'decision'
  | 'experiment';

export const CARD_TYPES: { value: CardType; label: string }[] = [
  { value: 'segment', label: 'Segment' },
  { value: 'persona', label: 'Persona' },
  { value: 'customer_problem', label: 'Customer problem' },
  { value: 'trigger_event', label: 'Trigger event' },
  { value: 'customer_quote', label: 'Customer quote' },
  { value: 'win', label: 'Win' },
  { value: 'loss', label: 'Loss / churn / objection' },
  { value: 'outcome_value', label: 'Outcome / value' },
  { value: 'product_capability', label: 'Product capability' },
  { value: 'implementation_signal', label: 'Implementation signal' },
  { value: 'metric', label: 'Metric' },
  { value: 'assumption', label: 'Assumption' },
  { value: 'open_question', label: 'Open question' },
  { value: 'decision', label: 'Decision' },
  { value: 'experiment', label: 'Experiment' },
];

export type CardColor = 'proof' | 'uncertain' | 'risk' | 'commitment';

export const CARD_COLOR_LABELS: Record<CardColor, string> = {
  proof: 'Proof / validated evidence',
  uncertain: 'Unclear / incomplete / conflicting',
  risk: 'Risk / friction / loss',
  commitment: 'Decision / commitment / experiment',
};

export type EvidenceGrade = 'A' | 'B' | 'C' | 'D';
export type Confidence = 'high' | 'medium' | 'low';
export type CardStatus = 'draft' | 'submitted' | 'accepted' | 'rejected';

export type Card = {
  id: string;
  workshopId: string;
  phaseId: string;
  type: CardType;
  title: string;
  body?: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  color: CardColor;
  evidenceGrade?: EvidenceGrade;
  confidence?: Confidence;
  x: number;
  y: number;
  clusterId?: string;
  thesisId?: string;
  sourceIds: string[];
  voteCount: number;
  status: CardStatus;
  lastEditedBy?: string;
};

export type EvidenceType =
  | 'customer_quote'
  | 'call_note'
  | 'deal'
  | 'win'
  | 'loss'
  | 'customer_outcome'
  | 'product_usage'
  | 'implementation_signal'
  | 'metric'
  | 'market_observation'
  | 'assumption';

export const EVIDENCE_TYPES: { value: EvidenceType; label: string }[] = [
  { value: 'customer_quote', label: 'Customer quote' },
  { value: 'call_note', label: 'Call note' },
  { value: 'deal', label: 'Deal' },
  { value: 'win', label: 'Win' },
  { value: 'loss', label: 'Loss' },
  { value: 'customer_outcome', label: 'Customer outcome' },
  { value: 'product_usage', label: 'Product usage' },
  { value: 'implementation_signal', label: 'Implementation signal' },
  { value: 'metric', label: 'Metric' },
  { value: 'market_observation', label: 'Market observation' },
  { value: 'assumption', label: 'Assumption' },
];

export type EvidenceSourceSystem =
  | 'manual'
  | 'crm'
  | 'call_recording'
  | 'support'
  | 'product_analytics'
  | 'file';

export type Evidence = {
  id: string;
  workshopId: string;
  type: EvidenceType;
  title: string;
  excerpt?: string;
  externalUrl?: string;
  sourceSystem?: EvidenceSourceSystem;
  accountName?: string;
  owner?: string;
  date?: string;
  whatItProves: string;
  limitations?: string;
  createdBy: string;
  createdAt: string;
  cardId?: string;
};

export const PROOF_GRADE_RUBRIC: Record<EvidenceGrade, { label: string; description: string; supports: string }> = {
  A: {
    label: 'Proven',
    description: 'Multiple independent direct sources, ideally behavior + outcome data.',
    supports: 'Can support Double down.',
  },
  B: {
    label: 'Supported',
    description: 'Some direct evidence, material gaps remain.',
    supports: 'Can support Validate-Fix or conditional Double down.',
  },
  C: {
    label: 'Hypothesis',
    description: 'Plausible, limited proof.',
    supports: 'Requires a validation experiment.',
  },
  D: {
    label: 'Assertion',
    description: 'Opinion or unsupported anecdote.',
    supports: 'Cannot support a GTM decision.',
  },
};

export type ThesisDimension =
  | 'problem_intensity'
  | 'buyer_clarity'
  | 'value_proof'
  | 'capability_fit'
  | 'win_repeatability'
  | 'sales_friction'
  | 'expansion_potential';

export const THESIS_DIMENSIONS: { value: ThesisDimension; label: string }[] = [
  { value: 'problem_intensity', label: 'Problem intensity' },
  { value: 'buyer_clarity', label: 'Buyer clarity' },
  { value: 'value_proof', label: 'Value proof' },
  { value: 'capability_fit', label: 'Capability fit' },
  { value: 'win_repeatability', label: 'Win repeatability' },
  { value: 'sales_friction', label: 'Sales friction' },
  { value: 'expansion_potential', label: 'Expansion potential' },
];

export type GTMThesis = {
  id: string;
  workshopId: string;
  name: string;
  segmentCardId?: string;
  personaCardId?: string;
  problemCardId?: string;
  capabilityCardId?: string;
  outcomeCardId?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
};

export type ThesisScore = {
  id: string;
  thesisId: string;
  dimension: ThesisDimension;
  score: number; // 1-5
  rationale?: string;
  evidenceIds: string[];
  updatedAt: string;
};

export type DecisionType = 'double_down' | 'validate_fix' | 'stop';

export const DECISION_TYPES: { value: DecisionType; label: string }[] = [
  { value: 'double_down', label: 'Double down' },
  { value: 'validate_fix', label: 'Validate-Fix' },
  { value: 'stop', label: 'Stop / Deprioritize' },
];

export type Decision = {
  id: string;
  workshopId: string;
  thesisId: string;
  type: DecisionType;
  rationale?: string;
  decidedBy: string;
  createdAt: string;
};

export type Experiment = {
  id: string;
  workshopId: string;
  thesisId: string;
  hypothesis: string;
  owner: string;
  deadline?: string;
  targetSegmentPersona?: string;
  smallestTest: string;
  evidenceToCollect: string;
  successThreshold: string;
  killReviseThreshold: string;
  createdAt: string;
};

export type Vote = {
  id: string;
  workshopId: string;
  cardId: string;
  participantId: string;
  createdAt: string;
};

export type Comment = {
  id: string;
  workshopId: string;
  cardId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type ParticipantRole = 'facilitator' | 'participant';

export type Participant = {
  id: string;
  workshopId: string;
  name: string;
  role: ParticipantRole;
  inviteToken: string;
  createdAt: string;
};

export type PhaseKey =
  | 'lobby'
  | 'decision_boundary'
  | 'customer_problem_evidence'
  | 'persona_buying_dynamics'
  | 'capability_value_mapping'
  | 'proof_repeatability'
  | 'portfolio_decision'
  | 'commit_export';

export type Phase = {
  id: PhaseKey;
  index: number;
  name: string;
  prompt: string;
  minutes: number;
};

export const PHASES: Phase[] = [
  { id: 'lobby', index: 0, name: 'Lobby / Setup', prompt: 'Set the workshop goal, invite participants, and review candidate segments.', minutes: 0 },
  {
    id: 'decision_boundary',
    index: 1,
    name: 'Decision boundary',
    prompt: 'What GTM choices must we be able to make by the end of this workshop?',
    minutes: 10,
  },
  {
    id: 'customer_problem_evidence',
    index: 2,
    name: 'Customer problem evidence',
    prompt: 'What problems do customers repeatedly describe in their own words? What happens if they do nothing?',
    minutes: 20,
  },
  {
    id: 'persona_buying_dynamics',
    index: 3,
    name: 'Persona and buying dynamics',
    prompt: 'For each problem: who suffers it, champions change, controls budget, uses the product, can block the deal?',
    minutes: 20,
  },
  {
    id: 'capability_value_mapping',
    index: 4,
    name: 'Capability to value mapping',
    prompt: 'What capability solves this problem, and what measurable change does the customer receive?',
    minutes: 20,
  },
  {
    id: 'proof_repeatability',
    index: 5,
    name: 'Proof and repeatability test',
    prompt: 'Where have we repeatedly won this combination? Where has it failed? What evidence explains both?',
    minutes: 20,
  },
  {
    id: 'portfolio_decision',
    index: 6,
    name: 'Portfolio decision',
    prompt:
      'If we could pursue only two GTM combinations for the next two quarters, which create the highest probability of repeatable growth?',
    minutes: 20,
  },
  {
    id: 'commit_export',
    index: 7,
    name: 'Commit and export',
    prompt: 'For every Double-down / Validate-Fix thesis, define an experiment with owner, deadline, and success/kill signals.',
    minutes: 10,
  },
];

export type Workshop = {
  id: string;
  name: string;
  goal: string;
  companyContext: string;
  activePhase: PhaseKey;
  phaseStartedAt?: string;
  createdBy: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  workshopId: string;
  channel: 'facilitator' | 'evidence_coach';
  role: 'user' | 'assistant';
  authorName?: string;
  content: string;
  createdAt: string;
};

export type ProposedActionKind =
  | 'create_card'
  | 'update_card'
  | 'link_evidence_to_card'
  | 'suggest_cluster'
  | 'start_vote'
  | 'summarize_evidence'
  | 'create_thesis'
  | 'update_thesis_score'
  | 'record_decision'
  | 'create_experiment'
  | 'advance_phase';

export type ProposedAction = {
  kind: ProposedActionKind;
  summary: string;
  payload: Record<string, unknown>;
};

export type AIProposal = {
  id: string;
  workshopId: string;
  channel: 'facilitator' | 'evidence_coach';
  actions: ProposedAction[];
  status: 'pending' | 'accepted' | 'edited' | 'rejected';
  createdAt: string;
  createdBy: string;
};

export type FacilitationContext = {
  workshop: { goal: string; companyContext: string };
  activePhase: { id: string; name: string; prompt: string; minutesRemaining: number };
  participants: { name: string; role: string; presence: string }[];
  cards: Card[];
  evidence: Evidence[];
  theses: GTMThesis[];
  decisions: Decision[];
  recentMessages: ChatMessage[];
};

export type AuditLogEntry = {
  id: string;
  workshopId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: Record<string, unknown>;
  createdAt: string;
};
