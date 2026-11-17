import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";

const Body = z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(4000) });

export async function GET() {
  return withUser(async ({ user, db }) => {
    const { data } = await db.from("agent_saved_prompts").select("id, title, body").eq("user_id", user.id!).order("created_at", { ascending: false }).limit(100);
    return { prompts: data ?? [] };
  });
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError("Give the prompt a title and some text");
    const { data, error } = await db.from("agent_saved_prompts").insert({ user_id: user.id, ...parsed.data }).select("id, title, body").single();
    if (error) throw new ActionError(error.message, 500);
    return { prompt: data };
  });
}
