/**
 * Scopes requested at login. Gmail scopes are asked for from day one so nobody
 * has to re-consent when drafts (M7) and reply detection (M8) switch on.
 * The OAuth consent screen must be set to Internal so these restricted
 * scopes skip Google's verification review.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");
