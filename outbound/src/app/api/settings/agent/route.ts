import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { AgentConfigSchema } from "@/lib/agent/config";
import { saveAgentConfig } from "@/lib/agent/store";

export async function PATCH(req: NextRequest) {
  const parsed = z.object({ patch: AgentConfigSchema.partial() }).safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Check the values");
    return { config: await saveAgentConfig(db, user, parsed.data.patch) };
  });
}
