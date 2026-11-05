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
```

## One-time setup for Google login

1. Google Cloud console: OAuth consent screen set to **Internal**. Enable the Gmail API.
2. Create an OAuth client (Web). Authorised redirect URI: `https://<project>.supabase.co/auth/v1/callback`.
3. Supabase > Authentication > Providers > Google: paste the client ID and secret.
4. Supabase > Authentication > URL configuration: add `<site>/auth/callback` (and `http://localhost:3000/auth/callback`) to redirect URLs.
5. Vercel: new project from this repo with **Root Directory = `outbound`**, env vars from `.env.example`.

Access is double-gated: email must be on `ALLOWED_EMAILS` and on `ALLOWED_DOMAIN`. It is checked in the OAuth callback, on every request in `src/proxy.ts`, and again in every signed-in page.
