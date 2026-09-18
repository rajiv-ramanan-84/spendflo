'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from './supabaseClient';

export type PresenceEntry = {
  participantId: string;
  name: string;
  role: 'facilitator' | 'participant';
  activity: string;
  onlineAt: string;
};

/**
 * Tracks and broadcasts presence for the current participant via a Supabase Realtime
 * Presence channel scoped to the workshop, and returns the merged list of everyone
 * currently present. `setActivity` lets the UI broadcast what the participant is
 * doing right now (e.g. "editing card X").
 */
export function usePresence(workshopId: string | undefined, participantId: string | undefined, name: string, role: 'facilitator' | 'participant') {
  const [presentUsers, setPresentUsers] = useState<PresenceEntry[]>([]);
  const [activity, setActivityState] = useState('viewing the board');

  useEffect(() => {
    if (!workshopId || !participantId) return;
    let sb;
    try {
      sb = getSupabaseBrowserClient();
    } catch {
      return;
    }

    const channel = sb.channel(`presence-${workshopId}`, {
      config: { presence: { key: participantId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceEntry>();
        const users = Object.values(state)
          .flat()
          .map((u: any) => u as PresenceEntry);
        setPresentUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            participantId,
            name,
            role,
            activity,
            onlineAt: new Date().toISOString(),
          } as PresenceEntry);
        }
      });

    return () => {
      sb!.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopId, participantId, name, role]);

  const setActivity = (next: string) => {
    setActivityState(next);
  };

  return { presentUsers, setActivity };
}
