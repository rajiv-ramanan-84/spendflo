import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encryptToken, parseKey } from "@/lib/crypto/tokens";

export type Role = "admin" | "manager" | "member";

export type TeamUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  avatar_url: string | null;
};

/**
 * undefined = database not configured (bootstrap mode), null = not on the team.
 */
export async function findTeamUser(email: string): Promise<TeamUser | null | undefined> {
  const db = supabaseAdmin();
  if (!db) return undefined;
  const { data, error } = await db
    .from("users")
    .select("id, email, name, role, active, avatar_url")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Team lookup failed: ${error.message}`);
  return (data as TeamUser | null) ?? null;
}

/** On every successful sign-in: link the auth user and keep the Gmail token fresh. */
export async function recordLogin(params: {
  teamUserId: string;
  authUserId: string;
  avatarUrl: string | null;
  providerRefreshToken: string | null | undefined;
}) {
  const db = supabaseAdmin();
  if (!db) return;

  const update: Record<string, unknown> = {
    auth_user_id: params.authUserId,
    last_login_at: new Date().toISOString(),
  };
  if (params.avatarUrl) update.avatar_url = params.avatarUrl;

  if (params.providerRefreshToken) {
    try {
      update.google_refresh_token_enc = encryptToken(params.providerRefreshToken, parseKey(process.env.TOKEN_ENCRYPTION_KEY));
      update.google_token_status = "ok";
    } catch (e) {
      // Never block sign-in on this. Drafts and reply detection show a reconnect banner instead.
      console.error("Could not store Google refresh token:", (e as Error).message);
    }
  }

  const { error } = await db.from("users").update(update).eq("id", params.teamUserId);
  if (error) console.error("recordLogin failed:", error.message);
}
