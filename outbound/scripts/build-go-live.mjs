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

// For a database that is already live: everything added since the first install, safe to paste any number
// of times. Every statement checks first, so it does not matter which of these you have already run.
out("03-catch-up.sql", [
  "-- CATCH-UP FOR AN EXISTING DATABASE. Paste the whole file into the Supabase SQL Editor and click Run.",
  "-- Safe to run more than once: it skips anything already in place. Covers every change after the first install:",
  "--   batch drafts, Claude spend controls, contact finder, shared mailboxes, nurture, dated signals, play and level, four levels.",
  "-- (If you have never installed, run 01-database.sql instead.)",
  "",
  read("supabase/migrations/20261106000006_claude_batches.sql"),
  read("supabase/migrations/20261106000007_claude_spend_controls.sql"),
  read("supabase/migrations/20261106000008_find_contacts.sql"),
  read("supabase/migrations/20261106000009_mailboxes.sql"),
  read("supabase/migrations/20261108000010_nurture.sql"),
  read("supabase/migrations/20261109000011_signals_play.sql"),
  read("supabase/migrations/20261109000012_super_hot.sql"),
  read("supabase/migrations/20261110000013_icp_fit.sql"),
  "notify pgrst, 'reload schema';",
  "",
  "-- The campaign skill, rewritten around the three plays. Adds a new skill version only if the text changed.",
  "-- If you edited the skill in Settings, copy your edits across afterwards: Settings > Claude skill keeps every version.",
  read("supabase/seed_skill.sql"),
].join("\n"));

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
