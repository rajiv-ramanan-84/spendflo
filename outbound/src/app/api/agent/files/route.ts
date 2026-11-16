import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { listFiles, saveFile } from "@/lib/agent/files";

export const maxDuration = 30;
const Body = z.object({ name: z.string().min(1).max(300), mime: z.string().max(120).nullish(), sizeBytes: z.number().int().min(0).max(200_000_000).optional(), pages: z.number().int().min(0).max(5000).nullish(), text: z.string().min(1).max(3_000_000) });

/** Saves the text the browser read from a file. The original file is never uploaded. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError("That file could not be read");
    return { file: await saveFile(db, user, parsed.data) };
  });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return withUser(async ({ user, db }) => ({ files: await listFiles(db, user, { archived: sp.get("archived") === "1", q: sp.get("q") ?? undefined }) }));
}
