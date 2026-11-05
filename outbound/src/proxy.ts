import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { accessConfigFromEnv, checkAccess } from "@/lib/auth/allowlist";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/signout"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Runs on every request: refreshes the Supabase session cookie, sends signed-out
 * users to /login, and signs out anyone who is no longer on the allowlist.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;

  if (!url || !anonKey) {
    // Not configured yet: only the login page (which explains the setup) is reachable.
    return isPublic(pathname) ? NextResponse.next() : NextResponse.redirect(new URL("/login?error=not_configured", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (isPublic(pathname)) {
    if (user && pathname === "/login" && checkAccess(user.email, accessConfigFromEnv()).allowed) {
      return NextResponse.redirect(new URL("/today", request.url));
    }
    return response;
  }

  if (!user) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const decision = checkAccess(user.email, accessConfigFromEnv());
  if (!decision.allowed) {
    await supabase.auth.signOut();
    const refused = NextResponse.redirect(new URL(`/login?error=${decision.reason}`, request.url));
    response.cookies.getAll().forEach((c) => refused.cookies.set(c));
    return refused;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|api/cron).*)"],
};
