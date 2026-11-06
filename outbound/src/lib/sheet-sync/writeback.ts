import { buildHeaderIndex, cell, CONTACT_FIELDS, MASTER_FIELDS, MASTER_WRITEBACK_FIELDS } from "./headers";
import type { CellWrite } from "./plan";

/**
 * Status write-back to Master. The only Master cells the app ever writes are
 * the four status columns below (plus Account ID, written by the plan). Every
 * other cell is the team's.
 */

export type CampaignStatus =
  | "draft" | "active" | "paused" | "responded" | "meeting_booked"
  | "closed_no_response" | "disqualified" | "recycle";

export type AccountWriteback = {
  campaignStatus: CampaignStatus | null;
  lastTouch: string | null; // YYYY-MM-DD
  nextStepDate: string | null; // YYYY-MM-DD
  contactsEngaged: number;
  contactsTotal: number;
};

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  responded: "Replied",
  meeting_booked: "Meeting booked",
  closed_no_response: "Closed, no response",
  disqualified: "Disqualified",
  recycle: "Recycle",
};

export function statusLabel(s: CampaignStatus | null): string {
  return s ? STATUS_LABEL[s] : "Not started";
}

export function writebackValues(w: AccountWriteback): Record<(typeof MASTER_WRITEBACK_FIELDS)[number], string> {
  return {
    status: statusLabel(w.campaignStatus),
    last_touch: w.lastTouch ?? "",
    next_step_date: w.nextStepDate ?? "",
    contacts_engaged: w.contactsTotal ? `${w.contactsEngaged} of ${w.contactsTotal}` : "",
  };
}

export type WritebackResult = { writes: CellWrite[]; missingColumns: string[] };

/**
 * Cells to write so Master reflects the app. Only changed cells are written,
 * so an idle sync writes nothing. A missing write-back column is reported,
 * never created.
 */
export function planWriteback(master: string[][], byAccountId: ReadonlyMap<string, AccountWriteback>): WritebackResult {
  const idx = buildHeaderIndex(master[0] ?? [], MASTER_FIELDS);
  const idCol = idx.col.sheet_account_id;
  const missingColumns = MASTER_WRITEBACK_FIELDS.filter((f) => idx.col[f] === undefined).map((f) => MASTER_FIELDS[f][0]);
  if (idCol === undefined) return { writes: [], missingColumns: ["account id", ...missingColumns] };

  const writes: CellWrite[] = [];
  master.slice(1).forEach((r, i) => {
    const id = cell(r, idCol);
    const w = byAccountId.get(id);
    if (!w) return;
    const values = writebackValues(w);
    for (const f of MASTER_WRITEBACK_FIELDS) {
      const col = idx.col[f];
      if (col === undefined) continue;
      if (cell(r, col) !== values[f]) writes.push({ tab: "master", row: i + 2, col, value: values[f] });
    }
  });
  return { writes, missingColumns };
}

/** Guard used right before anything is sent to Google: Master writes may only hit allowed columns. */
export function assertMasterWritesAllowed(master: string[][], writes: readonly CellWrite[]) {
  const idx = buildHeaderIndex(master[0] ?? [], MASTER_FIELDS);
  const allowed = new Set<number>(
    [...MASTER_WRITEBACK_FIELDS, "sheet_account_id" as const].map((f) => idx.col[f]).filter((c): c is number => c !== undefined),
  );
  const bad = writes.filter((w) => w.tab === "master" && !allowed.has(w.col));
  if (bad.length) throw new Error(`Refusing to write ${bad.length} Master cell(s) outside the app-owned columns`);
}

/** Contacts writes may only hit Contact ID and Account ID. */
export function assertContactWritesAllowed(contacts: string[][], writes: readonly CellWrite[]) {
  const idx = buildHeaderIndex(contacts[0] ?? [], CONTACT_FIELDS);
  const allowed = new Set([idx.col.sheet_contact_key, idx.col.account_id].filter((c): c is number => c !== undefined));
  const bad = writes.filter((w) => w.tab === "contacts" && !allowed.has(w.col));
  if (bad.length) throw new Error(`Refusing to write ${bad.length} Contacts cell(s) outside Contact ID and Account ID`);
}
