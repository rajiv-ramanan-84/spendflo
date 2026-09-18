'use client';

import { useRef, useState } from 'react';
import type { Card, CardColor, CardType, Participant } from '@/lib/types';
import { CARD_TYPES } from '@/lib/types';
import { CardColorBadge, EvidenceGradeBadge } from './CardBadge';
import { moveCard, updateCard, voteCard, deleteCard } from '@/lib/data';

const COLOR_ORDER: CardColor[] = ['proof', 'uncertain', 'risk', 'commitment'];
const COLOR_BG: Record<CardColor, string> = {
  proof: 'bg-amber-100 border-amber-300',
  uncertain: 'bg-teal-100 border-teal-300',
  risk: 'bg-rose-100 border-rose-300',
  commitment: 'bg-lime-100 border-lime-300',
};

export function CardCanvas({
  workshopId,
  cards,
  participants,
  currentParticipantId,
  onOpenEvidence,
  onOpenComments,
}: {
  workshopId: string;
  cards: Card[];
  participants: Participant[];
  currentParticipantId: string;
  onOpenEvidence: (card: Card) => void;
  onOpenComments: (card: Card) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<CardType | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<CardType>('customer_problem');

  const participantName = (id: string) => participants.find((p) => p.id === id)?.name ?? 'Someone';

  const visibleCards = typeFilter === 'all' ? cards : cards.filter((c) => c.type === typeFilter);

  function onDragStart(e: React.DragEvent, cardId: string) {
    setDragCardId(cardId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!dragCardId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - 90);
    const y = Math.max(0, e.clientY - rect.top - 40);
    moveCard(dragCardId, x, y, currentParticipantId).catch(() => {});
    setDragCardId(null);
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    const { createCard } = await import('@/lib/data');
    await createCard({ workshopId, phaseId: 'manual', type: newType, title: newTitle, authorId: currentParticipantId });
    setNewTitle('');
    setCreating(false);
  }

  async function cycleColor(card: Card) {
    const next = COLOR_ORDER[(COLOR_ORDER.indexOf(card.color) + 1) % COLOR_ORDER.length];
    await updateCard(card.id, { color: next }, currentParticipantId);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setTypeFilter('all')}
            className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap ${typeFilter === 'all' ? 'bg-gray-900 text-white' : 'border-gray-300 text-gray-600'}`}
          >
            All ({cards.length})
          </button>
          {CARD_TYPES.map((t) => {
            const count = cards.filter((c) => c.type === t.value).length;
            if (count === 0) return null;
            return (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap ${typeFilter === t.value ? 'bg-gray-900 text-white' : 'border-gray-300 text-gray-600'}`}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
        <button onClick={() => setCreating((v) => !v)} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap">
          + New card
        </button>
      </div>

      {creating && (
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
          <select value={newType} onChange={(e) => setNewType(e.target.value as CardType)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
            {CARD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs"
            placeholder="Card title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button onClick={handleCreate} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
            Add
          </button>
        </div>
      )}

      <div
        ref={canvasRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="relative flex-1 overflow-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]"
        style={{ minHeight: 500 }}
      >
        {visibleCards.length === 0 && (
          <p className="p-8 text-sm text-gray-400">No cards yet for this filter. Add one, or ask the AI facilitator to propose some.</p>
        )}
        {visibleCards.map((card) => (
          <div
            key={card.id}
            draggable
            onDragStart={(e) => onDragStart(e, card.id)}
            style={{ position: 'absolute', left: card.x, top: card.y, width: 220 }}
            className={`cursor-move rounded-lg border p-3 text-sm shadow-sm ${COLOR_BG[card.color]}`}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {CARD_TYPES.find((t) => t.value === card.type)?.label ?? card.type}
              </span>
              {card.evidenceGrade && <EvidenceGradeBadge grade={card.evidenceGrade} />}
            </div>
            <p className="mt-1 font-medium text-gray-900">{card.title}</p>
            {card.body && <p className="mt-1 text-xs text-gray-600 line-clamp-3">{card.body}</p>}
            <div className="mt-2">
              <button onClick={() => cycleColor(card)}>
                <CardColorBadge color={card.color} />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
              <span>by {participantName(card.authorId)}</span>
              {card.lastEditedBy && card.lastEditedBy !== card.authorId && <span>edited by {participantName(card.lastEditedBy)}</span>}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => voteCard(card.id, workshopId, currentParticipantId)}
                className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700"
              >
                Vote ({card.voteCount})
              </button>
              <button onClick={() => onOpenEvidence(card)} className="text-[11px] font-semibold text-blue-700">
                Evidence ({card.sourceIds.length})
              </button>
              <button onClick={() => onOpenComments(card)} className="text-[11px] font-semibold text-blue-700">
                Comment
              </button>
              <button onClick={() => deleteCard(card.id)} className="ml-auto text-[11px] text-gray-400 hover:text-rose-600">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
