import "server-only";
import { JWT } from "google-auth-library";
import { columnLetter } from "@/lib/sheet-sync/headers";
import type { CellWrite } from "@/lib/sheet-sync/plan";

/**
 * Google Sheets over the REST API with a service account (PRD section 11:
 * sync never depends on one person's login). Share the sheet with the service
 * account's email as an Editor.
 */

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const API = "https://sheets.googleapis.com/v4/spreadsheets";

let client: JWT | null = null;

function auth(): JWT {
  if (client) return client;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const creds = JSON.parse(raw) as { client_email: string; private_key: string };
  client = new JWT({ email: creds.client_email, key: creds.private_key, scopes: SCOPES });
  return client;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const { token } = await auth().getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

/** All values of a tab as displayed text, header row first. */
export async function readTab(sheetId: string, tab: string): Promise<string[][]> {
  const range = encodeURIComponent(`${quoteTab(tab)}`);
  const data = await call<{ values?: string[][] }>(`${API}/${sheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`);
  return data.values ?? [];
}

/** Writes individual cells. RAW so an ID or a date is stored exactly as given. */
export async function writeCells(sheetId: string, tabs: { master: string; contacts: string }, writes: readonly CellWrite[]) {
  if (!writes.length) return { updatedCells: 0 };
  const data = writes.map((w) => ({
    range: `${quoteTab(tabs[w.tab])}!${columnLetter(w.col)}${w.row}`,
    values: [[w.value]],
  }));
  let updated = 0;
  // Sheets accepts large batches, but keep requests modest.
  for (let i = 0; i < data.length; i += 500) {
    const res = await call<{ totalUpdatedCells?: number }>(`${API}/${sheetId}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data: data.slice(i, i + 500) }),
    });
    updated += res.totalUpdatedCells ?? 0;
  }
  return { updatedCells: updated };
}
