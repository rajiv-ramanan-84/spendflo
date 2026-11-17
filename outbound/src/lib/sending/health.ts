import "server-only";
import { promises as dns } from "node:dns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity/log";
import { loadSendingConfig } from "./config";
import { checkDomainDns, coreDomainSet, domainOf, shouldPauseForBounces, type Resolver } from "./rules";

/** Bounce watch and domain checks. Both run on the schedule; nothing here sends mail. */

const resolveTxt: Resolver = async (name) => {
  try {
    return await dns.resolveTxt(name);
  } catch {
    return [];
  }
};

/** Registers every domain mail is sent from and refreshes its SPF, DKIM and DMARC. */
export async function refreshDomains(db: SupabaseClient, resolve: Resolver = resolveTxt) {
  const cfg = await loadSendingConfig(db);
  const [{ data: users }, { data: mbs }, { data: known }] = await Promise.all([
    db.from("users").select("email").eq("active", true),
    db.from("mailboxes").select("email"),
    db.from("sending_domains").select("domain"),
  ]);
  const core = coreDomainSet(cfg, (users ?? []).map((u) => u.email as string));
  const domains = new Set<string>([...core, ...(mbs ?? []).map((m) => domainOf(m.email as string)), ...(known ?? []).map((k) => String(k.domain))]);
  let checked = 0;
  for (const d of [...domains].filter(Boolean)) {
    const r = await checkDomainDns(d, resolve);
    await db.from("sending_domains").upsert({ domain: d, kind: core.has(d) ? "core" : "outreach", ...r, checked_at: new Date().toISOString() }, { onConflict: "domain" });
    checked++;
  }
  return { checked };
}

/** Pauses any mailbox whose recent bounce rate is past the line. A person resumes it once the list is cleaned. */
export async function evaluateMailboxHealth(db: SupabaseClient, now: Date = new Date()) {
  const cfg = await loadSendingConfig(db);
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const { data: mbs } = await db.from("mailboxes").select("id, email").is("paused_at", null);
  const paused: Array<{ email: string; rate: number; sent: number; bounced: number }> = [];
  for (const m of mbs ?? []) {
    const email = String(m.email).toLowerCase();
    const { data: sentSteps } = await db.from("steps").select("contact_id").eq("sent_from", email).eq("channel", "email").eq("status", "done").gte("completed_at", since);
    const contactIds = [...new Set((sentSteps ?? []).map((s) => s.contact_id as string))];
    if (!contactIds.length) continue;
    const { count: bounced } = await db.from("contacts").select("id", { count: "exact", head: true }).in("id", contactIds).eq("bounced", true);
    const verdict = shouldPauseForBounces(contactIds.length, bounced ?? 0, cfg.bouncePausePct, cfg.bounceMinSample);
    if (!verdict.pause) continue;
    const reason = `Bounce rate ${verdict.rate}% (${bounced} of ${contactIds.length}) in 14 days`;
    await db.from("mailboxes").update({ paused_at: now.toISOString(), paused_reason: reason }).eq("id", m.id);
    await logActivity(db, { entityType: "mailbox", entityId: m.id as string, action: "auto_paused", actorId: null, after: { reason } });
    paused.push({ email, rate: verdict.rate, sent: contactIds.length, bounced: bounced ?? 0 });
  }
  return { paused };
}
