import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { SlackSettingsInput, saveSlackSettings } from "@/lib/slack/settings";

export async function PATCH(req: NextRequest) {
  const parsed = SlackSettingsInput.safeParse(await req.json().catch(() => null));
  return withUser(({ user, db }) => {
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Check the fields");
    return saveSlackSettings(db, user, parsed.data);
  });
}
