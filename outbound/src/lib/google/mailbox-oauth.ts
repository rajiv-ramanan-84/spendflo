import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

/**
 * Connecting a shared mailbox (e.g. sid@spendflo.com) is its own Google
 * consent, separate from anyone's login, so the mailbox never becomes a user.
 * The state is signed so the callback only accepts a connect we started.
 */
export const MAILBOX_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function mailboxRedirectUri() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/mailboxes/callback`;
}

function oauth() {
  return new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET, mailboxRedirectUri());
}

const secret = () => {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  return k;
};
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function signState(d: { mailboxId: string; userId: string }) {
  const body = Buffer.from(JSON.stringify({ ...d, exp: Date.now() + 10 * 60_000, n: randomBytes(8).toString("hex") })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readState(state: string | null): { mailboxId: string; userId: string } | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  const d = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { mailboxId: string; userId: string; exp: number };
  return d.exp > Date.now() ? { mailboxId: d.mailboxId, userId: d.userId } : null;
}

export function mailboxConsentUrl(d: { mailboxId: string; userId: string; email: string }) {
  return oauth().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: MAILBOX_SCOPES,
    login_hint: d.email,
    state: signState({ mailboxId: d.mailboxId, userId: d.userId }),
  });
}

/** Exchanges the code and confirms Google signed in the mailbox we asked for. */
export async function finishMailboxConsent(code: string) {
  const client = oauth();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error("Google did not return an identity");
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_OAUTH_CLIENT_ID });
  const email = ticket.getPayload()?.email?.toLowerCase() ?? null;
  return { email, refreshToken: tokens.refresh_token ?? null };
}
