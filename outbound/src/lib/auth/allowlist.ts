/**
 * Access gate. A user gets in only if their email is on the company Google
 * Workspace domain AND they are an active member of the team.
 *
 * "Team" means the users table once the database is connected (admins manage
 * it in Settings). Before that, ALLOWED_EMAILS in env is the bootstrap list.
 */

export type AccessConfig = {
  allowedEmails: string[];
  allowedDomain: string;
};

/** undefined = database not consulted (bootstrap mode); null = no row for this email. */
export type TeamRecord = { active: boolean } | null | undefined;

export type AccessDenial = "missing_email" | "wrong_domain" | "not_on_allowlist" | "deactivated";

export type AccessDecision = { allowed: true; email: string } | { allowed: false; reason: AccessDenial };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseEmailList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map(normalizeEmail)
    .filter((e) => e.length > 0);
}

export function accessConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AccessConfig {
  return {
    allowedEmails: parseEmailList(env.ALLOWED_EMAILS),
    allowedDomain: (env.ALLOWED_DOMAIN ?? "").trim().toLowerCase(),
  };
}

/** Domain-only check. Used by the request proxy, which has no database access. */
export function checkDomain(email: string | null | undefined, config: Pick<AccessConfig, "allowedDomain">): AccessDecision {
  if (!email || !email.includes("@")) return { allowed: false, reason: "missing_email" };
  const normalized = normalizeEmail(email);
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  // An empty domain config fails closed: nobody gets in by misconfiguration.
  if (!config.allowedDomain || domain !== config.allowedDomain) return { allowed: false, reason: "wrong_domain" };
  return { allowed: true, email: normalized };
}

export function checkAccess(email: string | null | undefined, config: AccessConfig, team?: TeamRecord): AccessDecision {
  const domain = checkDomain(email, config);
  if (!domain.allowed) return domain;

  if (team === undefined) {
    // Bootstrap mode: no database yet, fall back to the env list.
    return config.allowedEmails.includes(domain.email) ? domain : { allowed: false, reason: "not_on_allowlist" };
  }
  // Database is the single source of truth once connected.
  if (team === null) return { allowed: false, reason: "not_on_allowlist" };
  if (!team.active) return { allowed: false, reason: "deactivated" };
  return domain;
}

export const ACCESS_ERROR_COPY: Record<string, string> = {
  missing_email: "We couldn't read an email from that Google account. Please try again.",
  wrong_domain: "Please sign in with your Spendflo Google account.",
  not_on_allowlist: "This account isn't on the team list yet. Ask Rajiv or Sid to add you.",
  deactivated: "Your access is switched off right now. Ask Rajiv or Sid if that looks wrong.",
  oauth_failed: "Google sign-in didn't complete. Please try again.",
};
