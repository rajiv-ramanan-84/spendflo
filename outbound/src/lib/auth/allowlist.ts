/**
 * Access gate. A user gets in only if their email is on the allowlist AND
 * belongs to the company Google Workspace domain. Both checks, always.
 *
 * Milestone 1 reads the allowlist from env. Milestone 2 moves it to the
 * users table (active = true) so admins can manage it from Settings.
 */

export type AccessConfig = {
  allowedEmails: string[];
  allowedDomain: string;
};

export type AccessDecision =
  | { allowed: true; email: string }
  | { allowed: false; reason: "missing_email" | "wrong_domain" | "not_on_allowlist" };

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

export function checkAccess(email: string | null | undefined, config: AccessConfig): AccessDecision {
  if (!email || !email.includes("@")) return { allowed: false, reason: "missing_email" };
  const normalized = normalizeEmail(email);
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);

  // An empty domain config fails closed: nobody gets in by misconfiguration.
  if (!config.allowedDomain || domain !== config.allowedDomain) {
    return { allowed: false, reason: "wrong_domain" };
  }
  if (!config.allowedEmails.includes(normalized)) {
    return { allowed: false, reason: "not_on_allowlist" };
  }
  return { allowed: true, email: normalized };
}

export const ACCESS_ERROR_COPY: Record<string, string> = {
  missing_email: "We couldn't read an email from that Google account. Please try again.",
  wrong_domain: "Please sign in with your Spendflo Google account.",
  not_on_allowlist: "This account isn't on the team list yet. Ask Rajiv or Sid to add you.",
  oauth_failed: "Google sign-in didn't complete. Please try again.",
};
