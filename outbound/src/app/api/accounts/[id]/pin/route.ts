import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";

/** Pin or unpin an account to your own Focus Today. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async ({ user, db }) => {
    const { data } = await db.from("account_pins").select("account_id").eq("user_id", user.id!).eq("account_id", id).maybeSingle();
    if (data) await db.from("account_pins").delete().eq("user_id", user.id!).eq("account_id", id);
    else await db.from("account_pins").insert({ user_id: user.id, account_id: id });
    return { pinned: !data };
  });
}
