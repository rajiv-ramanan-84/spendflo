import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ActionError } from "@/lib/campaigns/actions";
import { canEditAdminSettings, type SessionUser } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity/log";
import { DEFAULT_SENDING, type SendingConfig } from "./rules";

export async function loadSendingConfig(db: SupabaseClient): Promise<SendingConfig> {
  const { data } = await db.from("sending_settings").select("*").eq("id", true).maybeSingle();
  if (!data) return DEFAULT_SENDING;
  return {
    perAddressMax: Number(data.per_address_max) || DEFAULT_SENDING.perAddressMax,
    warnAt: Number(data.warn_at) || DEFAULT_SENDING.warnAt,
    protectCore: (data.protect_core as SendingConfig["protectCore"]) ?? DEFAULT_SENDING.protectCore,
    coreDomains: (data.core_domains as string[] | null) ?? [],
    warmupEnabled: data.warmup_enabled !== false,
    warmupSteps: Array.isArray(data.warmup_steps) && data.warmup_steps.length ? (data.warmup_steps as SendingConfig["warmupSteps"]) : DEFAULT_SENDING.warmupSteps,
    bouncePausePct: Number(data.bounce_pause_pct) || DEFAULT_SENDING.bouncePausePct,
    bounceMinSample: Number(data.bounce_min_sample) || DEFAULT_SENDING.bounceMinSample,
    optoutLine: (data.optout_line as string | null) ?? null,
  };
}

const Domain = z.string().trim().toLowerCase().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "That is not a domain, for example spendflo.com");

export const SendingInput = z
  .object({
    perAddressMax: z.number().int().min(1).max(500),
    warnAt: z.number().int().min(1).max(500),
    protectCore: z.enum(["off", "warn", "block"]),
    coreDomains: z.array(Domain).max(20),
    warmupEnabled: z.boolean(),
    bouncePausePct: z.number().min(0.5).max(100),
    bounceMinSample: z.number().int().min(5).max(1000),
    optoutLine: z.string().trim().max(300).nullable(),
  })
  .partial();

/**
 * One save path for the Settings card and the assistant, so they cannot drift apart.
 * Admins only. Every change lands in the activity log with before and after.
 */
export async function saveSendingConfig(db: SupabaseClient, user: SessionUser, input: z.infer<typeof SendingInput>) {
  if (!canEditAdminSettings(user)) throw new ActionError("Only admins can change sending limits", 403);
  const cur = await loadSendingConfig(db);
  const next = { ...cur, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as SendingConfig;
  if (next.warnAt > next.perAddressMax) throw new ActionError(`The warning level (${next.warnAt}) cannot be above the daily maximum (${next.perAddressMax})`);
  const { error } = await db.from("sending_settings").update({
    per_address_max: next.perAddressMax,
    warn_at: next.warnAt,
    protect_core: next.protectCore,
    core_domains: next.coreDomains,
    warmup_enabled: next.warmupEnabled,
    bounce_pause_pct: next.bouncePausePct,
    bounce_min_sample: next.bounceMinSample,
    optout_line: next.optoutLine || null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }).eq("id", true);
  if (error) throw new ActionError(error.message, 500);
  await logActivity(db, { entityType: "settings", entityId: user.id!, action: "sending_limits_updated", actorId: user.id, before: cur, after: next });
  return next;
}
