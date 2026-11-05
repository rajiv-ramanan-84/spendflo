/**
 * Loads the local stack with real sheet exports through the production sync
 * code, links the four users to local auth ids, and prints a summary.
 * Run with the react-server condition so server-only modules load:
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/local-load.ts <master.json> <contacts.json>
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { supabaseAdmin } from "../src/lib/supabase/admin";
import { syncFromValues } from "../src/lib/sheet-sync/run";

export const LOCAL_AUTH_IDS: Record<string, string> = {
  "rajiv@spendflo.com": "00000000-0000-4000-8000-000000000001",
  "siddharth@spendflo.com": "00000000-0000-4000-8000-000000000002",
  "chandramouli@spendflo.com": "00000000-0000-4000-8000-000000000003",
  "mahasweta@spendflo.com": "00000000-0000-4000-8000-000000000004",
};

async function main() {
  const [mPath, cPath] = process.argv.slice(2);
  const db = supabaseAdmin();
  if (!db) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const sql = Object.entries(LOCAL_AUTH_IDS)
    .map(([email, id]) => `insert into auth.users (id, email) values ('${id}', '${email}') on conflict do nothing; update users set auth_user_id = '${id}' where email = '${email}';`)
    .join("\n");
  execFileSync("psql", ["-h", "localhost", "-p", process.env.PG_PORT ?? "55433", "-U", "postgres", "-q", "-c", sql]);

  const master = JSON.parse(readFileSync(mPath, "utf8")).values;
  const contacts = JSON.parse(readFileSync(cPath, "utf8")).values;
  const r = await syncFromValues(db, master, contacts);
  console.log("plan ok:", r.plan.ok, "counts:", r.plan.counts);
  console.log("auto-drafts queued:", r.autoDraftQueued, "| cells that would be written:", r.writes.length, "| missing columns:", r.missingWritebackColumns);

  type CountQuery = ReturnType<ReturnType<typeof db.from>["select"]>;
  const count = async (t: string, f?: (q: CountQuery) => CountQuery) => {
    let q: CountQuery = db.from(t).select("*", { count: "exact", head: true });
    if (f) q = f(q);
    return (await q).count;
  };
  console.log("db accounts:", await count("accounts"), "active:", await count("accounts", (q) => q.eq("archived", false)),
    "| contacts:", await count("contacts"), "| open review items:", await count("data_quality_issues", (q) => q.eq("status", "open")),
    "| queued drafts:", await count("claude_calls", (q) => q.eq("status", "queued")));
}

main().catch((e) => { console.error(e); process.exit(1); });
