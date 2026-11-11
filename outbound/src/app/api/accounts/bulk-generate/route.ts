import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { bulkGenerate, planBulkGenerate } from "@/lib/campaigns/bulk-generate";

export const maxDuration = 60;

/** `preview: true` only reports what would happen and what it would cost. Otherwise it queues the drafts as one batch. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { accountIds?: string[]; preview?: boolean; includeNurture?: boolean; replaceDrafts?: boolean };
  const ids = Array.isArray(b.accountIds) ? b.accountIds.map(String) : [];
  return withUser(async ({ user, db }) => (b.preview ? { plan: await planBulkGenerate(db, user, ids) } : bulkGenerate(db, user, ids, { includeNurture: !!b.includeNurture, replaceDrafts: !!b.replaceDrafts })));
}
