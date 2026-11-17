import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";
import { isConsumerDomain, domainOf } from "@/lib/sending/rules";

const Body = z.object({ email: z.string().trim().toLowerCase().email(), writesAsUserId: z.string().uuid().optional(), usedByUserId: z.string().uuid().optional() });

/**
 * Adds a mailbox people can send from. Anyone on the team can add one for themselves: it writes as them, is run by them
 * and starts in warm-up. Managers and admins may write as someone else; making it another person's default is an admin's call.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return withUser(async ({ user, db }) => {
    if (!parsed.success) throw new ActionError("Enter the inbox address");
    const d = parsed.data;
    const admin = canEditAdminSettings(user);
    const lead = admin || user.role === "manager";
    const writesAs = d.writesAsUserId ?? user.id!;
    const usedBy = d.usedByUserId ?? user.id!;
    // Managers can add an inbox that writes as someone else (for example Mouli running pseudo inboxes written as Rajiv). Only admins make it another person's default.
    if (writesAs !== user.id && !lead) throw new ActionError("You can add an inbox that writes as you. To write as someone else, ask a manager or admin.", 403);
    if (usedBy !== user.id && !admin) throw new ActionError("Only an admin can set up an inbox for someone else to use.", 403);
    if (isConsumerDomain(d.email)) throw new ActionError(`${domainOf(d.email)} is a personal inbox domain. Use an inbox on a company or outreach domain.`);
    const { data: person } = await db.from("users").select("id").eq("email", d.email).maybeSingle();
    if (person) throw new ActionError("That address belongs to a teammate's own login. An extra inbox needs its own address.");
    const { data: existing } = await db.from("mailboxes").select("id").eq("email", d.email).maybeSingle();
    if (existing && !lead) throw new ActionError("That inbox is already added. Ask an admin to give you access.", 409);
    const { data: m, error } = await db.from("mailboxes").upsert({ email: d.email, writes_as_user_id: writesAs, ...(existing ? {} : { connected_by: user.id }) }, { onConflict: "email" }).select("id").single();
    if (error || !m) throw new ActionError(error?.message ?? "Could not add the inbox", 500);
    // Whoever adds it can use it. An admin may also make it someone's default; everyone else keeps their current default.
    await db.from("mailbox_operators").upsert({ mailbox_id: m.id, user_id: usedBy }, { onConflict: "mailbox_id,user_id", ignoreDuplicates: true });
    if (admin && d.usedByUserId) await db.from("users").update({ send_mailbox_id: m.id }).eq("id", d.usedByUserId);
    await db.from("sending_domains").upsert({ domain: domainOf(d.email), kind: "outreach" }, { onConflict: "domain", ignoreDuplicates: true });
    await logActivity(db, { entityType: "mailbox", entityId: m.id, action: "added", actorId: user.id, after: { email: d.email, writesAs, usedBy } });
    return { mailboxId: m.id };
  });
}
