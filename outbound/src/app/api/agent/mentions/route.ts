import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";

/** Accounts and contacts to pick as context. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().replace(/[%_]/g, "");
  const byId = req.nextUrl.searchParams.get("id");
  return withUser(async ({ db }) => {
    if (byId) {
      const { data } = await db.from("accounts").select("id, name").eq("id", byId).maybeSingle();
      return { items: data ? [{ type: "account" as const, id: data.id as string, label: data.name as string, sub: "" }] : [] };
    }
    let a = db.from("accounts").select("id, name, tier, play_level").is("deleted_at", null).eq("archived", false).order("name").limit(8);
    if (q) a = a.ilike("name", `%${q}%`);
    let c = db.from("contacts").select("id, full_name, title, account_id").is("deleted_at", null).order("full_name").limit(6);
    if (q) c = c.ilike("full_name", `%${q}%`); else c = c.limit(0);
    const [{ data: accounts }, { data: contacts }] = await Promise.all([a, q ? c : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; title: string | null; account_id: string }> })]);
    const { data: accts } = (contacts ?? []).length ? await db.from("accounts").select("id, name").in("id", (contacts ?? []).map((x) => x.account_id as string)) : { data: [] as Array<{ id: string; name: string }> };
    const an = new Map((accts ?? []).map((x) => [x.id as string, x.name as string]));
    return {
      items: [
        ...(accounts ?? []).map((x) => ({ type: "account" as const, id: x.id as string, label: x.name as string, sub: [x.tier ? `Tier ${x.tier}` : null, x.play_level ? String(x.play_level).replace("_", " ") : null].filter(Boolean).join(" · ") })),
        ...(contacts ?? []).map((x) => ({ type: "contact" as const, id: x.id as string, label: x.full_name as string, sub: [x.title, an.get(x.account_id as string)].filter(Boolean).join(" · ") })),
      ],
    };
  });
}
