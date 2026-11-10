import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { bulkLaunch, planBulkLaunch } from "@/lib/campaigns/bulk-launch";

export const maxDuration = 120;

/** `preview: true` only reports what would happen. Otherwise it launches; `overrideFlags` includes accounts with open flags. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { accountIds?: string[]; preview?: boolean; overrideFlags?: boolean };
  const ids = Array.isArray(b.accountIds) ? b.accountIds.map(String) : [];
  return withUser(async ({ user, db }) => (b.preview ? { plan: await planBulkLaunch(db, user, ids) } : bulkLaunch(db, user, ids, { overrideFlags: !!b.overrideFlags })));
}
