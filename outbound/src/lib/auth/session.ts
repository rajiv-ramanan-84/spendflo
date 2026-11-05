import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accessConfigFromEnv, checkAccess } from "./allowlist";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

/** Use in every signed-in page and server action. Never trust the proxy alone. */
export async function requireUser(): Promise<SessionUser> {
  await cookies(); // per-request rendering, even before Supabase is configured
  if (!supabaseEnv()) redirect("/login?error=not_configured");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");

  const decision = checkAccess(user.email, accessConfigFromEnv());
  if (!decision.allowed) {
    await supabase.auth.signOut();
    redirect(`/login?error=${decision.reason}`);
  }

  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: decision.email,
    name: (meta.full_name as string) || (meta.name as string) || decision.email.split("@")[0],
    avatarUrl: (meta.avatar_url as string) || null,
  };
}
