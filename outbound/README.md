# Outbound Command Center

Internal outbound execution app for Spendflo (Rajiv, Sid, Mouli, Shweta). Claude plans, humans send.

- Spec: [docs/PRD.md](docs/PRD.md), [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md), [docs/flo-campaign-engine-SKILL.md](docs/flo-campaign-engine-SKILL.md)
- Build plan, schema and open decisions: [docs/PLAN.md](docs/PLAN.md)

## Run locally

```bash
cp .env.example .env.local   # fill in Supabase keys
npm install
npm run dev
```

## Checks

```bash
npm test          # vitest
npm run typecheck
npm run lint
npm run build
npm run db:verify # fresh Postgres: apply migrations + seed, assert constraints and RLS
```

## Database

Migrations live in `supabase/migrations`, the seed in `supabase/seed.sql` (four users, default caps, priority weights, Slack times, models).

Apply to your Supabase project with the Supabase CLI:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

Or paste each migration, then the seed, into the Supabase SQL editor in order.

Access model: every active user reads everything (one shared truth). The browser never writes; all changes go through server code that checks role, logs activity and uses the service role. Google refresh tokens are AES-256-GCM encrypted and are not readable from the browser.

Generate `TOKEN_ENCRYPTION_KEY` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## One-time setup for Google login

1. Google Cloud console: OAuth consent screen set to **Internal**. Enable the Gmail API.
2. Create an OAuth client (Web). Authorised redirect URI: `https://<project>.supabase.co/auth/v1/callback`.
3. Supabase > Authentication > Providers > Google: paste the client ID and secret.
4. Supabase > Authentication > URL configuration: add `<site>/auth/callback` (and `http://localhost:3000/auth/callback`) to redirect URLs.
5. Vercel: new project from this repo with **Root Directory = `outbound`**, env vars from `.env.example`.

Access is double-gated: the email must be on `ALLOWED_DOMAIN` and be an active row in the `users` table (admins manage this in Settings). `ALLOWED_EMAILS` is only a bootstrap list used before `SUPABASE_SERVICE_ROLE_KEY` is set. The domain is checked on every request in `src/proxy.ts`; the full team check runs in the OAuth callback and in every signed-in page.
