import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accessConfigFromEnv, checkAccess } from "@/lib/auth/allowlist";
import { findTeamUser, recordLogin } from "@/lib/auth/team";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) return NextResponse.redirect(`${origin}/login?error=oauth_failed`);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(`${origin}/login?error=oauth_failed`);

  const { user, provider_refresh_token } = data.session;
  const team = user.email ? await findTeamUser(user.email) : null;
  const decision = checkAccess(user.email, accessConfigFromEnv(), team);
  if (!decision.allowed) {
    // Refused: kill the session immediately so nothing is left behind.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=${decision.reason}`);
  }

  if (team) {
    // Encrypt and keep the Google refresh token so the background Gmail check
    // can run while the user is offline.
    await recordLogin({
      teamUserId: team.id,
      authUserId: user.id,
      avatarUrl: (user.user_metadata?.avatar_url as string) ?? null,
      providerRefreshToken: provider_refresh_token,
    });
  }

  return NextResponse.redirect(`${origin}${next}`);
}
