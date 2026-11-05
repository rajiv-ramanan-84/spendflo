import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "./config";

export async function createSupabaseServerClient() {
  // Read cookies first so every caller is rendered per request, never prerendered.
  const cookieStore = await cookies();
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component. The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
