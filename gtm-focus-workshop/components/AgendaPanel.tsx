'use client';

import type { PhaseKey, Participant } from '@/lib/types';
import { PHASES } from '@/lib/types';
import { setActivePhase } from '@/lib/data';
import type { PresenceEntry } from '@/lib/usePresence';

export function AgendaPanel({
  workshopId,
  activePhase,
  isFacilitator,
  presentUsers,
  participants,
}: {
  workshopId: string;
  activePhase: PhaseKey;
  isFacilitator: boolean;
  presentUsers: PresenceEntry[];
  participants: Participant[];
}) {
  const activeIndex = PHASES.findIndex((p) => p.id === activePhase);

  async function goTo(phaseId: PhaseKey) {
    if (!isFacilitator) return;
    await setActivePhase(workshopId, phaseId);
  }

  const presentIds = new Set(presentUsers.map((u) => u.participantId));

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 scrollbar-thin">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Agenda</p>
      <ol className="mt-2 space-y-1">
        {PHASES.filter((p) => p.index > 0).map((p) => {
          const isActive = p.id === activePhase;
          const isDone = p.index < activeIndex;
          return (
            <li key={p.id}>
              <button
                onClick={() => goTo(p.id)}
                disabled={!isFacilitator}
                className={`w-full rounded-md px-2 py-2 text-left text-xs ${
                  isActive ? 'bg-gray-900 text-white' : isDone ? 'bg-gray-100 text-gray-400 line-through' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="font-semibold">
                  {p.index}. {p.name}
                </span>
                <p className={`mt-0.5 text-[11px] ${isActive ? 'text-gray-200' : 'text-gray-400'}`}>{p.prompt}</p>
                <p className={`mt-0.5 text-[10px] ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>{p.minutes} min</p>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">Presence ({participants.length})</p>
      <ul className="mt-2 space-y-1">
        {participants.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-xs text-gray-600">
            <span className={`h-2 w-2 rounded-full ${presentIds.has(p.id) ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            {p.name}
            {p.role === 'facilitator' && <span className="text-[10px] text-gray-400">(facilitator)</span>}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex gap-2">
        <a href={`/w/${workshopId}/brief`} className="flex-1 rounded-md border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700">
          Export brief
        </a>
      </div>
      {!isFacilitator && <p className="mt-2 text-[10px] text-gray-400">Only the facilitator can advance phases.</p>}
    </div>
  );
}
