import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { assignAccounts } from "@/lib/campaigns/actions";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { accountIds?: string[]; ownerId?: string };
  return withUser(({ user, db }) => assignAccounts(db, user, (body.accountIds ?? []).slice(0, 500), String(body.ownerId ?? "")));
}
