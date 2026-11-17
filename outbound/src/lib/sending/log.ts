import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIn } from "@/lib/calendar/dates";
import { senderFor } from "@/lib/google/gmail";
import { istDayStartEpoch } from "./rules";
import { listMessageIds } from "@/lib/google/gmail";

/** One row per email sent, keyed by step so a send is never counted twice. */
export async function recordSend(db: SupabaseClient, d: { stepId: string; assigneeId: string | null; userId: string | null; sentFrom: string | null; sentAt: string; firstTouch: boolean }) {
  let from = d.sentFrom;
  if (!from && d.assigneeId) from = (await senderFor(db, d.assigneeId).catch(() => null))?.email ?? null;
  if (!from) return;
  const { error } = await db.from("send_log").upsert(
    { step_id: d.stepId, from_email: from.toLowerCase(), user_id: d.userId, sent_at: d.sentAt, sent_day: todayIn("Asia/Kolkata", new Date(d.sentAt)), first_touch: d.firstTouch },
    { onConflict: "step_id", ignoreDuplicates: true },
  );
  if (error) console.error("send_log insert failed:", error.message);
}

/**
 * What Gmail says a dedicated inbox sent today, so mail sent outside the app counts toward the limit too.
 * Capped at 100 by one Gmail page, which is well past any sensible daily limit.
 */
export async function refreshGmailSentCount(db: SupabaseClient, token: string, email: string, now: Date = new Date()) {
  const day = todayIn("Asia/Kolkata", now);
  const ids = await listMessageIds(token, `in:sent after:${istDayStartEpoch(day)}`, 100);
  await db.from("gmail_sent_counts").upsert({ email: email.toLowerCase(), day, sent: ids.length, checked_at: now.toISOString() }, { onConflict: "email,day" });
  return ids.length;
}
