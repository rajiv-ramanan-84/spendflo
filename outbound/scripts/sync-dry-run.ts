/**
 * Offline dry run of the sheet sync against exported tabs. Runs the exact plan
 * the hourly sync runs, against an empty database, and prints what it would do.
 * Usage: npx tsx scripts/sync-dry-run.ts <master.json> <contacts.json>
 * (each file: Sheets API values export, {"values": [[...], ...]})
 */
import { readFileSync } from "node:fs";
import { planSync } from "../src/lib/sheet-sync/plan";
import { planWriteback } from "../src/lib/sheet-sync/writeback";
import { assertContactWritesAllowed, assertMasterWritesAllowed } from "../src/lib/sheet-sync/writeback";

const [mPath, cPath] = process.argv.slice(2);
const master: string[][] = JSON.parse(readFileSync(mPath, "utf8")).values;
const contacts: string[][] = JSON.parse(readFileSync(cPath, "utf8")).values;

const users = new Map([["rajiv", "u-rajiv"], ["sid", "u-sid"], ["mouli", "u-mouli"], ["shweta", "u-shweta"]]);
const plan = planSync(master, contacts, { accounts: new Map(), contacts: new Map(), dncEmails: new Set(), dncLinkedIns: new Set(), usersByName: users });

console.log("ok:", plan.ok, plan.fatal);
console.log("counts:", plan.counts);
const byType = plan.dq.reduce<Record<string, number>>((m, d) => ((m[`${d.tab}:${d.type}`] = (m[`${d.tab}:${d.type}`] ?? 0) + 1), m), {});
console.log("review queue:", byType);
console.log("auto-draft (new Tier A/B with owner and a usable contact):", plan.autoDraft.length, plan.autoDraft.join(" "));
console.log("ID cells that would change:", plan.sheetWrites.length);
const wb = planWriteback(master, new Map());
console.log("missing write-back columns:", wb.missingColumns);
assertMasterWritesAllowed(master, plan.sheetWrites);
assertContactWritesAllowed(contacts, plan.sheetWrites);
console.log("write guards: pass");
for (const d of plan.dq.filter((x) => ["email_domain_mismatch", "unknown_owner", "missing_verdict", "shared_email", "verdict_tier_mismatch"].includes(x.type))) {
  console.log(`  ${d.tab} row ${d.row} ${d.type}: ${d.key} | ${d.details}`);
}
