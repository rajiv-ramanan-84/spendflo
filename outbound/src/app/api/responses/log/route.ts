import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { logManualResponse } from "@/lib/responses/service";
import { ClassifySchema } from "@/lib/claude/schemas";
import { ActionError } from "@/lib/campaigns/actions";

const Body = z.object({
  contactId: z.string().uuid(),
  channel: z.enum(["email", "linkedin_message", "linkedin_connect", "linkedin_inmail", "call", "other"]),
  classification: ClassifySchema.shape.classification,
  text: z.string().max(20000).nullish(),
  ownerNextStep: z.string().max(2000).nullish(),
  pauseOtherTracks: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(({ user, db }) => {
    if (!parsed.success) throw new ActionError("Pick a contact, a channel and what kind of response it was");
    return logManualResponse(db, user, parsed.data);
  });
}
