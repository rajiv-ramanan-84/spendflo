import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client. Prefers the service role key when present (for API
 * routes that need elevated access), falling back to the anon key. Never import this
 * from a 'use client' file. Reads env vars lazily at call time so the app can build
 * without real credentials.
 */
export function getSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase server credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
