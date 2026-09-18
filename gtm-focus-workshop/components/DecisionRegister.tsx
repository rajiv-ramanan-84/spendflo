'use client';

import { useState } from 'react';
import type { GTMThesis, Decision, DecisionType } from '@/lib/types';
import { DECISION_TYPES } from '@/lib/types';
import { recordDecision, createThesis } from '@/lib/data';

const COLUMN_ORDER: { type: DecisionType; label: string; color: string }[] = [
  { type: 'double_down', label: 'Double down', color: 'border-lime-400 bg-lime-50' },
  { type: 'validate_fix', label: 'Validate-Fix', color: 'border-teal-400 bg-teal-50' },
  { type: 'stop', label: 'Stop', color: 'border-rose-400 bg-rose-50' },
];

export function DecisionRegister({
  workshopId,
  theses,
  decisions,
  currentParticipantName,
  onThesesChanged,
}: {
  workshopId: string;
  theses: GTMThesis[];
  decisions: Decision[];
  currentParticipantName: string;
  onThesesChanged: () => void;
}) {
  const [newThesisName, setNewThesisName] = useState('');
  const [creating, setCreating] = useState(false);

  const latestDecisionByThesis = new Map<string, Decision>();
  for (const d of decisions) {
    const existing = latestDecisionByThesis.get(d.thesisId);
    if (!existing || new Date(d.createdAt) > new Date(existing.createdAt)) latestDecisionByThesis.set(d.thesisId, d);
  }

  const openTheses = theses.filter((t) => !latestDecisionByThesis.has(t.id));

  async function decide(thesisId: string, type: DecisionType) {
    await recordDecision({ workshopId, thesisId, type, decidedBy: currentParticipantName });
    onThesesChanged();
  }

  async function handleCreateThesis() {
    if (!newThesisName.trim()) return;
    await createThesis({ workshopId, name: newThesisName });
    setNewThesisName('');
    setCreating(false);
    onThesesChanged();
  }

  return (
    <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-4">
      <div className="rounded-lg border border-gray-300 bg-gray-50 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-600">Open items ({openTheses.length})</p>
          <button onClick={() => setCreating((v) => !v)} className="text-[11px] font-semibold text-blue-700">
            + Thesis
          </button>
        </div>
        {creating && (
          <div className="mt-2 flex gap-1">
            <input
              className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-[11px]"
              placeholder="e.g. Mid-market Procurement / SOX audit trigger"
              value={newThesisName}
              onChange={(e) => setNewThesisName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateThesis()}
            />
            <button onClick={handleCreateThesis} className="rounded-md bg-gray-900 px-2 py-1 text-[11px] font-semibold text-white">
              Add
            </button>
          </div>
        )}
        <ul className="mt-2 space-y-2">
          {openTheses.map((t) => (
            <li key={t.id} className="rounded-md border border-gray-200 bg-white p-2 text-xs">
              <a href={`/w/${workshopId}/thesis/${t.id}`} className="font-semibold text-gray-800 hover:underline">
                {t.name}
              </a>
              <div className="mt-2 flex flex-wrap gap-1">
                {DECISION_TYPES.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => decide(t.id, d.value)}
                    className="rounded-md border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-100"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
          {openTheses.length === 0 && <p className="text-[11px] text-gray-400">No open theses - create one from a segment/persona/problem/capability combo.</p>}
        </ul>
      </div>

      {COLUMN_ORDER.map((col) => {
        const items = theses.filter((t) => latestDecisionByThesis.get(t.id)?.type === col.type);
        return (
          <div key={col.type} className={`rounded-lg border p-3 ${col.color}`}>
            <p className="text-xs font-semibold text-gray-700">
              {col.label} ({items.length})
            </p>
            <ul className="mt-2 space-y-2">
              {items.map((t) => (
                <li key={t.id} className="rounded-md border border-white/60 bg-white/70 p-2 text-xs">
                  <a href={`/w/${workshopId}/thesis/${t.id}`} className="font-semibold text-gray-800 hover:underline">
                    {t.name}
                  </a>
                  {latestDecisionByThesis.get(t.id)?.rationale && (
                    <p className="mt-1 text-[11px] text-gray-500">{latestDecisionByThesis.get(t.id)!.rationale}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
