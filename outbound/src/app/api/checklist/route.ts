import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { ITEMS } from "@/lib/checklist/items";

const Body = z.object({ key: z.string().min(1).max(64), done: z.boolean() });

/** Ticks an item off for the signed-in person, or puts it back. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success || !ITEMS.some((i) => i.key === parsed.data.key)) throw new ActionError("Unknown checklist item");
    const { key, done } = parsed.data;
    if (done) {
      const { error } = await db.from("user_checklist").upsert({ user_id: user.id, item_key: key, done_at: new Date().toISOString() }, { onConflict: "user_id,item_key" });
      if (error) throw new ActionError(error.message, 500);
    } else {
      await db.from("user_checklist").delete().eq("user_id", user.id!).eq("item_key", key);
    }
  });
}
