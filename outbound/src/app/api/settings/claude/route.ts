import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { SpendInput, saveSpendSettings } from "@/lib/claude/spend-settings";

export async function PATCH(req: NextRequest) {
  const parsed = SpendInput.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError("Budget must be a number between 0 and 5000");
    return saveSpendSettings(db, user, parsed.data);
  });
}
