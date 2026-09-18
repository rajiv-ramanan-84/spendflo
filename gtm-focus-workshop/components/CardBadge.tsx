import type { CardColor, EvidenceGrade } from '@/lib/types';
import { CARD_COLOR_LABELS } from '@/lib/types';

const COLOR_CLASSES: Record<CardColor, string> = {
  proof: 'bg-amber-300 text-amber-950 border-amber-400',
  uncertain: 'bg-teal-300 text-teal-950 border-teal-400',
  risk: 'bg-rose-300 text-rose-950 border-rose-400',
  commitment: 'bg-lime-300 text-lime-950 border-lime-400',
};

export function CardColorBadge({ color }: { color: CardColor }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${COLOR_CLASSES[color]}`}>
      {CARD_COLOR_LABELS[color]}
    </span>
  );
}

const GRADE_CLASSES: Record<EvidenceGrade, string> = {
  A: 'bg-green-600 text-white',
  B: 'bg-blue-600 text-white',
  C: 'bg-orange-500 text-white',
  D: 'bg-gray-400 text-white',
};

export function EvidenceGradeBadge({ grade }: { grade: EvidenceGrade }) {
  return <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${GRADE_CLASSES[grade]}`}>{grade}</span>;
}
