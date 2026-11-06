# Go live

The step-by-step guide and its files are in `go-live/`:

- `go-live/GO_LIVE_STEP_BY_STEP.md`: the guide, about 2 hours end to end
- `go-live/01-database.sql`: complete database setup, one paste into Supabase
- `go-live/02-schedules.sql`: timed jobs (template; a filled-in private copy is shared separately)
- `go-live/slack-app-manifest.yaml`: creates the Slack bot
- `go-live/vercel-environment-variables.template.env`: settings template (the filled-in private copy is shared separately)

Rebuild the kit after changing migrations, seeds or schedules: `node scripts/build-go-live.mjs`.
