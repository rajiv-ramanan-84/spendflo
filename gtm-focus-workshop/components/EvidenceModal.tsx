'use client';

import { useEffect, useState } from 'react';
import type { Card, Evidence, EvidenceType, EvidenceGrade } from '@/lib/types';
import { EVIDENCE_TYPES, PROOF_GRADE_RUBRIC } from '@/lib/types';
import { createEvidence, listEvidence, updateCard } from '@/lib/data';
import { EvidenceGradeBadge } from './CardBadge';

export function EvidenceModal({
  workshopId,
  card,
  currentParticipantId,
  currentParticipantName,
  onClose,
}: {
  workshopId: string;
  card: Card;
  currentParticipantId: string;
  currentParticipantName: string;
  onClose: () => void;
}) {
  const [all, setAll] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ type: EvidenceType; title: string; excerpt: string; whatItProves: string; limitations: string; accountName: string }>({
    type: 'customer_quote',
    title: '',
    excerpt: '',
    whatItProves: '',
    limitations: '',
    accountName: '',
  });

  useEffect(() => {
    listEvidence(workshopId)
      .then((ev) => setAll(ev.filter((e) => card.sourceIds.includes(e.id))))
      .finally(() => setLoading(false));
  }, [workshopId, card.sourceIds]);

  async function handleAdd() {
    if (!form.title || !form.whatItProves) return;
    const e = await createEvidence({
      workshopId,
      cardId: card.id,
      type: form.type,
      title: form.title,
      excerpt: form.excerpt || undefined,
      whatItProves: form.whatItProves,
      limitations: form.limitations || undefined,
      accountName: form.accountName || undefined,
      createdBy: currentParticipantName,
      sourceSystem: 'manual',
    });
    setAll((prev) => [...prev, e]);
    await updateCard(card.id, { sourceIds: [...card.sourceIds, e.id] }, currentParticipantId);
    setForm({ type: 'customer_quote', title: '', excerpt: '', whatItProves: '', limitations: '', accountName: '' });
  }

  async function setGrade(grade: EvidenceGrade) {
    await updateCard(card.id, { evidenceGrade: grade }, currentParticipantId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-500">Evidence for</h3>
            <p className="text-lg font-bold">{card.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500">Proof grade for this card</p>
          <div className="mt-1 flex gap-2">
            {(['A', 'B', 'C', 'D'] as EvidenceGrade[]).map((g) => (
              <button
                key={g}
                onClick={() => setGrade(g)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${card.evidenceGrade === g ? 'border-gray-900' : 'border-gray-200'}`}
                title={PROOF_GRADE_RUBRIC[g].description}
              >
                <EvidenceGradeBadge grade={g} /> {PROOF_GRADE_RUBRIC[g].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold text-gray-500">Linked evidence ({all.length})</p>
          {loading ? (
            <p className="mt-2 text-xs text-gray-400">Loading...</p>
          ) : all.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">No evidence attached yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {all.map((e) => (
                <li key={e.id} className="rounded-md border border-gray-100 p-2 text-xs">
                  <p className="font-semibold">
                    {EVIDENCE_TYPES.find((t) => t.value === e.type)?.label}: {e.title}
                  </p>
                  {e.excerpt && <p className="mt-1 italic text-gray-600">"{e.excerpt}"</p>}
                  <p className="mt-1 text-gray-700">Proves: {e.whatItProves}</p>
                  {e.limitations && <p className="mt-1 text-gray-400">Limitations: {e.limitations}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 space-y-2 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500">Add proof point</p>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EvidenceType })} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs">
            {EVIDENCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            placeholder="Title (e.g. Acme Corp renewal call)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            placeholder="Account name (optional)"
            value={form.accountName}
            onChange={(e) => setForm({ ...form, accountName: e.target.value })}
          />
          <textarea
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            rows={2}
            placeholder="Quote / excerpt (optional)"
            value={form.excerpt}
            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
          />
          <textarea
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            rows={2}
            placeholder="What it proves"
            value={form.whatItProves}
            onChange={(e) => setForm({ ...form, whatItProves: e.target.value })}
          />
          <textarea
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            rows={2}
            placeholder="Limitations (optional)"
            value={form.limitations}
            onChange={(e) => setForm({ ...form, limitations: e.target.value })}
          />
          <button onClick={handleAdd} className="w-full rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white">
            Add evidence
          </button>
        </div>
      </div>
    </div>
  );
}
