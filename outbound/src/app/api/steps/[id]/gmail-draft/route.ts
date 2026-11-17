import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { createGmailDraftForStep } from "@/lib/steps/execute";

export const maxDuration = 60;

const Body = z.object({ mailboxId: z.string().uuid().nullish(), override: z.boolean().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = Body.safeParse(await req.json().catch(() => ({})));
  return withUser(({ user, db }) => createGmailDraftForStep(db, user, id, body.success ? { mailboxId: body.data.mailboxId ?? null, override: body.data.override } : {}));
}
