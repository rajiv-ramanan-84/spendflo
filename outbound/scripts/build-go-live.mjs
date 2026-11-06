// Builds the go-live kit in go-live/: every file the setup guide asks for.
// Run: node scripts/build-go-live.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8").trim();
const out = (p, s) => writeFileSync(new URL(`go-live/${p}`, root), s.endsWith("\n") ? s : `${s}\n`);

// 1. One database file: every migration in order, then the starting data.
const migrations = readdirSync(new URL("supabase/migrations/", root)).filter((f) => f.endsWith(".sql")).sort();
const parts = [
  ...migrations.map((f) => [`supabase/migrations/${f}`, read(`supabase/migrations/${f}`)]),
  ["supabase/seed.sql (team and default settings)", read("supabase/seed.sql")],
  ["supabase/seed_holidays.sql (US federal holidays)", read("supabase/seed_holidays.sql")],
  ["supabase/seed_skill.sql (campaign skill, version 1)", read("supabase/seed_skill.sql")],
];
out("01-database.sql", [
  "-- Outbound Command Center: complete database setup.",
  "-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.",
  "-- Run it once, on a new project. It creates every table, the security rules,",
  "-- the four team members, US holidays and the campaign skill.",
  "",
  "begin;",
  ...parts.map(([name, sql]) => `\n-- ============================================================\n-- ${name}\n-- ============================================================\n${sql}`),
  "",
  "commit;",
].join("\n"));

// 2. Schedules, with the two values to fill in.
out("02-schedules.sql", read("supabase/schedule.sql"));

// 3. Slack app, created from a manifest in one paste.
out("slack-app-manifest.yaml", `display_information:
  name: Outbound Command Center
  description: Morning plan and reply alerts for the Spendflo outbound team
  background_color: "#e91e8c"
features:
  bot_user:
    display_name: Outbound Command Center
    always_online: true
oauth_config:
  scopes:
    bot:
      - chat:write
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
`);

// 4. Environment variables template (the filled-in copy is generated separately and never committed).
out("vercel-environment-variables.template.env", read(".env.example"));
console.log(`go-live/: 01-database.sql (${migrations.length} migrations + 3 seeds), 02-schedules.sql, slack-app-manifest.yaml, vercel-environment-variables.template.env`);
