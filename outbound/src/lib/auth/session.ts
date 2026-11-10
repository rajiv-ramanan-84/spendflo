import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accessConfigFromEnv, checkAccess } from "./allowlist";
import { findTeamUser, type Role } from "./team";

export type SessionUser = {
  authUserId: string;
  /** users.id; null only in bootstrap mode before the database is connected. */
  id: string | null;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
};

/** Use in every signed-in page, route handler and server action. Never trust the proxy alone. */
export const requireUser = cache(async function requireUser(): Promise<SessionUser> {
  await cookies(); // per-request rendering, even before Supabase is configured
  if (!supabaseEnv()) redirect("/login?error=not_configured");

  const supabase = await createSupabaseServerClient();
  // The token is verified here without a call to the auth server when the project signs with asymmetric keys.
  // Access is still checked against the team table on every request, so removing someone takes effect at once.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const user = { id: claims.sub, email: (claims.email as string | undefined) ?? null, user_metadata: (claims.user_metadata ?? {}) as Record<string, unknown> };

  const team = user.email ? await findTeamUser(user.email) : null;
  const decision = checkAccess(user.email, accessConfigFromEnv(), team);
  if (!decision.allowed) {
    await supabase.auth.signOut();
    redirect(`/login?error=${decision.reason}`);
  }

  const meta = user.user_metadata ?? {};
  const googleName = (meta.full_name as string) || (meta.name as string) || decision.email.split("@")[0];
  return {
    authUserId: user.id,
    id: team?.id ?? null,
    email: decision.email,
    name: team?.name || googleName,
    role: team?.role ?? "member",
    avatarUrl: team?.avatar_url || (meta.avatar_url as string) || null,
  };
});

export function canEditAdminSettings(user: SessionUser) {
  return user.role === "admin";
}

export function canAssignAccounts(user: SessionUser) {
  return user.role === "admin" || user.role === "manager";
}
