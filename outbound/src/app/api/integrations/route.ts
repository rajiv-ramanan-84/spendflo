import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { addIntegration } from "@/lib/agent/integrations";

const Body = z.object({ name: z.string().trim().min(2).max(60), url: z.string().trim().url(), token: z.string().trim().max(4000).nullish(), preset: z.enum(["tapistro", "custom"]).default("custom") });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError("Give it a name and a full https address");
    return addIntegration(db, user, { name: parsed.data.name, url: parsed.data.url, token: parsed.data.token ?? null, preset: parsed.data.preset === "custom" ? null : parsed.data.preset });
  });
}
