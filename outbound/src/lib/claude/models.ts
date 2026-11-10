/**
 * The models a draft can be written with, and what one draft costs on each. Drafts run through the
 * half-price batch service, so these are batch prices measured on real accounts (Hilton, AbbVie and others).
 * Pure: safe to import from screens.
 */
export const DRAFT_MODELS = [
  { id: "claude-sonnet-5-5", label: "Sonnet", note: "Best balance. Full campaigns, strong copy.", perDraftUsd: 0.12 },
  { id: "claude-opus-5-5", label: "Opus", note: "Deepest reasoning. About twice the cost of Sonnet.", perDraftUsd: 0.25 },
  { id: "claude-haiku-5-5", label: "Haiku", note: "Cheapest, about 15 times less. Fewer contacts planned, copy is simpler.", perDraftUsd: 0.01 },
] as const;
export type DraftModelId = (typeof DRAFT_MODELS)[number]["id"];
export const isDraftModel = (m: string): m is DraftModelId => DRAFT_MODELS.some((x) => x.id === m);
export const draftCost = (model: string) => DRAFT_MODELS.find((m) => m.id === model)?.perDraftUsd ?? 0.25;

export const DEFAULT_BULK_MAX = 10;
export const BULK_MAX_LIMIT = 25;
