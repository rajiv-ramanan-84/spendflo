import { withUser } from "@/lib/api/handler";

export async function GET() {
  return withUser(async ({ user, db }) => {
    const { data } = await db.from("agent_threads").select("id, title, updated_at, context").eq("user_id", user.id!).eq("archived", false).order("updated_at", { ascending: false }).limit(30);
    return { threads: data ?? [] };
  });
}
