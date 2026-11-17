import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { evaluateSend } from "@/lib/sending/guard";

/** Can this email go out as it is? Asked before Gmail opens, so a warning shows first. Changes nothing. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mailboxId = req.nextUrl.searchParams.get("mailbox");
  return withUser(async ({ user, db }) => {
    const { data: s } = await db.from("steps").select("id, contact_id, assignee_id, send_from_mailbox_id, gmail_thread_id, channel").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!s) throw new ActionError("Step not found", 404);
    if (s.channel !== "email" || !s.assignee_id) return { check: null };
    if (s.assignee_id !== user.id) return { check: null };
    const { data: last } = await db.from("steps").select("sent_from").eq("contact_id", s.contact_id).eq("channel", "email").eq("status", "done").not("sent_from", "is", null).order("completed_at", { ascending: false }).limit(1).maybeSingle();
    const v = await evaluateSend(db, user, { id, contactId: s.contact_id, assigneeId: s.assignee_id, sendFromMailboxId: s.send_from_mailbox_id, gmailThreadId: s.gmail_thread_id }, { mailboxId, lastSentFrom: (last?.sent_from as string | null) ?? null });
    return { check: { state: v.state, block: v.block, coreWarning: v.coreWarning, options: v.options, canOverride: v.canOverride, notice: v.notice, email: v.inbox.email, mailboxId: v.inbox.mailboxId } };
  });
}
