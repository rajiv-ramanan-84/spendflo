'use client';

import { useEffect, useRef } from 'react';
import { getSupabaseBrowserClient } from './supabaseClient';

/**
 * Subscribes to Postgres changes (insert/update/delete) on `table` filtered by
 * workshop_id, and calls `onChange` with the raw payload whenever a row changes.
 * Caller is responsible for merging the change into its own state (kept generic
 * here so each screen can apply its own row->domain-type mapper).
 */
export function useRealtimeTable(table: string, workshopId: string | undefined, onChange: (payload: any) => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!workshopId) return;
    let sb;
    try {
      sb = getSupabaseBrowserClient();
    } catch {
      return; // Supabase not configured; screens still render with empty state.
    }

    const channel = sb
      .channel(`${table}-${workshopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `workshop_id=eq.${workshopId}` },
        (payload) => onChangeRef.current(payload)
      )
      .subscribe();

    return () => {
      sb!.removeChannel(channel);
    };
  }, [table, workshopId]);
}
