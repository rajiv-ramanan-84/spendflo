import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accessConfigFromEnv, checkAccess } from "@/lib/auth/allowlist";

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

  const decision = checkAccess(data.session.user.email, accessConfigFromEnv());
  if (!decision.allowed) {
    // Refused: kill the session immediately so nothing is left behind.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=${decision.reason}`);
  }

  // Milestone 2: encrypt and store data.session.provider_refresh_token on the
  // users row so the background Gmail check can run without the user online.

  return NextResponse.redirect(`${origin}${next}`);
}
