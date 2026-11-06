import { Logo } from "@/components/ui/logo";
import { ACCESS_ERROR_COPY } from "@/lib/auth/allowlist";
import { supabaseEnv } from "@/lib/supabase/config";
import { GoogleSignInButton } from "./google-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const configured = supabaseEnv() !== null;
  const message = error === "not_configured" || !configured
    ? "Supabase isn't connected yet. Add the keys from .env.example and restart."
    : error
      ? ACCESS_ERROR_COPY[error] ?? ACCESS_ERROR_COPY.oauth_failed
      : null;

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-white px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand-100 opacity-60 blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size={32} />
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-8 shadow-[var(--shadow-lift)]">
          <h1 className="text-xl font-semibold tracking-tight">Good to see you</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            Sign in with your Spendflo Google account to see today&apos;s plan.
          </p>

          {message ? (
            <div role="alert" className="mt-5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
              {message}
            </div>
          ) : null}

          <div className="mt-6">
            <GoogleSignInButton next={next} disabled={!configured} />
          </div>

          <p className="mt-6 text-xs leading-relaxed text-ink-400">
            We ask for Gmail access so the app can create drafts in your own inbox and spot replies from your contacts. Nothing is ever sent for you.
          </p>
        </div>
      </div>
    </main>
  );
}
