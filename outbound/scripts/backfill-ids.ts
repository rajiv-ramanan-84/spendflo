/**
 * One-time backfill of Account ID and Contact ID for an existing account book,
 * using the exact rules the hourly sync uses (src/lib/sheet-sync/identity.ts).
 * Reads local exports, prints a report, writes the columns to paste as JSON.
 *
 * Usage: npx tsx scripts/backfill-ids.ts <master.tsv> <contacts.json> <out-dir>
 *   master.tsv: name|owner|tier|verdict|domain, one row per Master row in order
 *   contacts.json: Sheets values export of the contacts tab (A:O)
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  assignAccountIds,
  assignContactIds,
  buildAccountIndex,
  idCellValue,
  linkContact,
  NO_MATCH_MARK,
} from "../src/lib/sheet-sync/identity";

const [masterPath, contactsPath, outDir] = process.argv.slice(2);
const master = readFileSync(masterPath, "utf8").trim().split("\n").map((l, i) => {
  const [name, owner, tier, verdict, domain] = l.split("|");
  return { row: i + 2, idCell: "", name, owner, tier, verdict, domain };
});

const accountAssign = assignAccountIds(master);
const accountIds = accountAssign.map((a) => idCellValue(a) ?? "");
const index = buildAccountIndex(
  master.flatMap((m, i) => {
    const a = accountAssign[i];
    return a.kind === "new" || a.kind === "keep" ? [{ id: a.id, name: m.name, domain: m.domain }] : [];
  }),
);

const values: string[][] = JSON.parse(readFileSync(contactsPath, "utf8")).values;
const hdr = values[0];
const col = (h: string) => hdr.indexOf(h);
const get = (r: string[], h: string) => (r[col(h)] ?? "").trim();
const contacts = values.slice(1).map((r, i) => ({ row: i + 2, r }));

const links = contacts.map(({ r }) =>
  linkContact({ accountIdCell: "", company: get(r, "Company"), email: get(r, "Best Email"), companyDomain: get(r, "Wiza company_domain") }, index),
);
const contactAssign = assignContactIds(
  contacts.map(({ row, r }, i) => ({ row, idCell: "", fullName: get(r, "Full Name"), email: get(r, "Best Email"), linkedinUrl: get(r, "LinkedIn URL"), accountId: links[i].accountId })),
);

const contactIdCol = contactAssign.map((a) => idCellValue(a) ?? "");
const contactAccountCol = links.map((l) =>
  l.accountId ?? (l.reason === "ambiguous" ? `CHECK: could be ${l.candidates!.join(" or ")}` : NO_MATCH_MARK),
);

writeFileSync(`${outDir}/master-account-id.json`, JSON.stringify([["Account ID"], ...accountIds.map((v) => [v])]));
writeFileSync(
  `${outDir}/contacts-ids.json`,
  JSON.stringify([["Contact ID", "Account ID"], ...contactIdCol.map((v, i) => [v, contactAccountCol[i]])]),
);

// ---- report ----
const count = <T,>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
console.log("ACCOUNTS", master.length, count(accountAssign, (a) => a.kind));
for (const [i, a] of accountAssign.entries()) if (a.kind === "duplicate") console.log(`  row ${a.row} ${master[i].name} -> DUPLICATE of ${a.duplicateOf} (${a.reason})`);
console.log("CONTACTS", contacts.length, count(contactAssign, (a) => a.kind));
console.log("LINKS", count(links, (l) => (l.accountId ? (l as { method: string }).method : (l as { reason: string }).reason)));

const nameOf = new Map(master.map((m, i) => [accountIds[i], m]));
const activeLinked = links.filter((l) => l.accountId && ["FIT", "MAYBE"].includes(nameOf.get(l.accountId!)?.verdict ?? "") && nameOf.get(l.accountId!)?.tier !== "D").length;
console.log("contacts linked to active (FIT/MAYBE, tier A-C) accounts:", activeLinked);
const withContacts = new Set(links.map((l) => l.accountId).filter(Boolean));
const empty = master.filter((m, i) => ["A", "B", "C"].includes(m.tier) && accountAssign[i].kind === "new" && !withContacts.has(accountIds[i]));
console.log("active accounts with zero contacts:", empty.length, empty.map((m) => m.name).join("; "));
console.log("\nUNLINKED / AMBIGUOUS contacts:");
for (const [i, l] of links.entries()) if (!l.accountId) console.log(`  row ${contacts[i].row} ${get(contacts[i].r, "Full Name")} | ${get(contacts[i].r, "Company")} | ${contactAccountCol[i]}`);
console.log("\nLinks that differ from a plain company-name match (spot check):");
for (const [i, l] of links.entries()) {
  if (l.accountId && (l as { method: string }).method !== "company_name") {
    const acct = nameOf.get(l.accountId)!.name;
    const comp = get(contacts[i].r, "Company");
    if (acct.toLowerCase().slice(0, 4) !== comp.toLowerCase().slice(0, 4)) console.log(`  row ${contacts[i].row} ${comp} -> ${l.accountId} ${acct} via ${(l as { method: string }).method}`);
  }
}
for (const a of contactAssign) if (a.kind !== "new") console.log("  contact", a);

console.log("\nDuplicate pairs (kept row first):");
const rowOfId = new Map<string, number>();
contactAssign.forEach((a, i) => { if (a.kind === "new" || a.kind === "keep") rowOfId.set(a.id, i); });
for (const [i, a] of contactAssign.entries()) {
  if (a.kind !== "duplicate") continue;
  for (const j of [rowOfId.get(a.duplicateOf)!, i]) {
    const r = contacts[j].r;
    console.log(`  row ${contacts[j].row} | ${get(r, "Full Name")} | ${get(r, "Title").slice(0, 40)} | ${get(r, "Company")} | ${get(r, "LinkedIn URL").replace(/.*\/in\//, "in/")} | ${get(r, "Best Email")}`);
  }
  console.log(`    -> ${a.reason}`);
}
