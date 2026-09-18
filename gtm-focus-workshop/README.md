# GTM Focus Workshop

A real-time, multi-user web app for a CRO-led GTM focus workshop: four participants
join a shared room, contribute structured evidence cards, use an in-app AI facilitator
and evidence coach (Claude, not ChatGPT), and leave with defensible, evidence-backed
GTM decisions (Double down / Validate-Fix / Stop), a 30/60/90 experiment plan, and an
exportable GTM Focus Brief.

This is a standalone sub-project inside the Spendflo monorepo. It has its own
`package.json`, is not wired into the root app, and does not touch any other files in
the repo.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Realtime + Presence) for persistence and live sync
- Anthropic Claude API (`@anthropic-ai/sdk`), called only from `app/api/*` server routes
- Zod for request validation, `nanoid` available for ids

## Setup

1. **Create a Supabase project** at https://supabase.com (free tier is fine).
2. **Run the schema**: open the SQL editor in your Supabase project and run the entire
   contents of `supabase/schema.sql`. This creates all tables, enables Row Level
   Security with permissive per-workshop policies (see the TODO note in that file),
   and adds the tables the app subscribes to (`cards`, `votes`, `decisions`,
   `participants`, `comments`, `gtm_theses`, `ai_proposals`, `chat_messages`) to the
   `supabase_realtime` publication.
3. **Get your API keys**: Project Settings -> API for the Supabase URL/anon key/service
   role key, and https://console.anthropic.com for an Anthropic API key.
4. **Configure env vars**:
   ```bash
   cp .env.example .env.local
   # then fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   # SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
   ```
5. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000, create a workshop, and open the lobby link on other
   laptops/tabs to simulate multiple participants.

`npm run build` was run at the end of implementation and completes successfully
without real Supabase/Anthropic credentials (env vars are read at request/runtime,
never at build time).

## Architecture

- `lib/types.ts` - all domain types (`Card`, `Evidence`, `GTMThesis`, `Decision`,
  `Experiment`, `FacilitationContext`, `ProposedAction`, the 7 workshop phases, etc.).
  This is the TypeScript mirror of `supabase/schema.sql`.
- `lib/supabaseClient.ts` / `lib/supabaseServer.ts` - lazy, runtime-only Supabase client
  factories (browser anon-key client; server client for API routes).
- `lib/mappers.ts` - snake_case Postgres rows <-> camelCase TS types.
- `lib/data.ts` - the single client-side data-access layer. Every card/evidence/thesis/
  decision/experiment/vote/comment/chat write goes through here, whether triggered by a
  person clicking a button or by an accepted AI proposal.
- `lib/applyProposedAction.ts` - takes an accepted `ProposedAction` from the AI and
  calls the exact same functions in `lib/data.ts` a human interaction would use. There
  is no separate, more-privileged AI write path.
- `lib/useRealtimeTable.ts` - generic Supabase Realtime `postgres_changes` subscription
  hook, used for cards, participants, theses, decisions.
- `lib/usePresence.ts` - Supabase Presence-channel hook showing who's online and what
  they're doing.
- `lib/aiPrompts.ts` - the Facilitator and Evidence Coach system prompts (kept close to
  verbatim per the product spec), the `CLAUDE_MODEL` constant (currently
  `claude-sonnet-5` - swap in one place as models change), and the `propose_actions`
  tool schema shared by both assistants.
- `app/api/facilitator/route.ts`, `app/api/evidence-coach/route.ts` - server-only route
  handlers. Each accepts a compact `FacilitationContext`, calls Claude with the
  matching system prompt and the `propose_actions` tool, and returns `{ message,
  proposedActions }`. They never execute a mutation themselves - `ANTHROPIC_API_KEY` is
  read only here and never sent to the client.
- `app/page.tsx` - landing/create-workshop screen.
- `app/w/[workshopId]/lobby` - purpose, candidate segments, proof-grade explainer,
  join-by-name, facilitator-only Start.
- `app/w/[workshopId]/room` - the live room: header (name/phase/presence/export), left
  agenda + facilitator phase controls, center drag-positioned card canvas (color-coded
  proof/uncertain/risk/commitment, always paired with a text label), right AI panel
  (Facilitator + Evidence Coach tabs with an Accept/Reject queue for proposed actions),
  bottom decision register (Double down / Validate-Fix / Stop / Open items columns).
- `app/w/[workshopId]/thesis/[thesisId]` - thesis detail: 7-dimension scorecard with
  linked-evidence counts, linked cards, and an experiment composer.
- `app/w/[workshopId]/brief` - renders accepted decisions, scorecards, experiments and
  open assumptions, with a client-side "Export Markdown" download.
- `components/` - `CardCanvas`, `AIPanel`, `DecisionRegister`, `AgendaPanel`,
  `EvidenceModal`, `CommentsModal`, `CardBadge` (color + evidence-grade badges).

### Realtime & collaboration

`cards`, `participants`, `gtm_theses` and `decisions` are subscribed via
`postgres_changes` in the room page, so create/edit/move/vote/decision changes made by
any participant propagate to every open tab. Presence is tracked per participant via a
Supabase Presence channel keyed by `participantId`, and the agenda panel shows an
online/offline dot per participant. Card writes are optimistic on the acting client
(Supabase resolves them near-instantly) and every card update stamps `last_edited_by`,
which the canvas renders as "edited by X" when it differs from the original author.

### AI proposal flow

Both `/api/facilitator` and `/api/evidence-coach` ask Claude to call a single
`propose_actions` tool rather than freeform JSON, covering all eleven action kinds from
the spec (`create_card`, `update_card`, `link_evidence_to_card`, `suggest_cluster`,
`start_vote`, `summarize_evidence`, `create_thesis`, `update_thesis_score`,
`record_decision`, `create_experiment`, `advance_phase`). The route returns those
actions unexecuted. `AIPanel` renders each as a card with **Accept** / **Reject**
buttons (Edit is deferred - see below); Accept calls
`applyProposedAction`, which dispatches to the same `lib/data.ts` functions a manual
edit would call, so AI-authored changes and human changes are indistinguishable once
applied and go through the same RLS-scoped writes.

### Access model (MVP)

There is no Supabase Auth / magic-link login yet. A workshop is joined via its lobby
URL plus an invite token generated per-participant
(`participants.invite_token`, currently minted on join but not yet enforced as a
gate - see "Not yet built"). Treat the lobby link as the shared secret for the room.

## Not yet built (deferred to later milestones)

- **Magic-link / real authentication.** Room access currently relies on knowing the
  workshop's lobby URL; `participants.invite_token` is generated but not yet checked
  server-side before allowing reads/writes. RLS policies are permissive
  (`using (true)`) and scoped only by `workshop_id` - see the TODO comment at the top
  of `supabase/schema.sql`.
- **CRM / call-recording import.** Evidence is entered manually via the Evidence modal
  (`sourceSystem` supports `crm` / `call_recording` / etc. as a label, but there is no
  live connector).
- **File uploads.** Evidence can link an `externalUrl` but there is no Supabase Storage
  upload flow for attachments/screenshots.
- **Contradiction detection.** The Evidence Coach prompt asks Claude to consider
  contradictions/limitations qualitatively, but there is no automated cross-card
  contradiction scan.
- **"Edit" on an AI proposed action.** Accept and Reject are implemented; Edit (letting
  a user tweak the payload before applying) is not - reject and re-ask is the current
  workaround.
- **Drag-to-cluster grouping UI beyond manual positioning.** Cards can be dragged
  anywhere and carry a `clusterId` field (settable via an AI `suggest_cluster` proposal
  or directly in Supabase), but there's no lasso/group-selection gesture in the UI yet.
- **Card audit history UI.** `audit_log` table and `logAudit()` helper exist in
  `lib/data.ts` but nothing currently calls it or renders a history view per card.
- **Facilitator timer countdown.** Phases show their suggested duration and can be
  advanced by the facilitator, but there's no live countdown clock in the header yet.

## Known build note

`npm run build` succeeds cleanly. `next@14.2.x` currently prints an `npm` deprecation/
security-advisory warning for the 14.x line during `npm install`; bumping to Next 15
was out of scope for this pass to avoid an App Router upgrade during MVP scaffolding -
worth revisiting before this goes further than a workshop pilot.
