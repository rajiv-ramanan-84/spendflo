import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { SendingInput, saveSendingConfig } from "@/lib/sending/config";

export async function PUT(req: NextRequest) {
  const parsed = SendingInput.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Those numbers do not look right");
    return { config: await saveSendingConfig(db, user, parsed.data) };
  });
}
