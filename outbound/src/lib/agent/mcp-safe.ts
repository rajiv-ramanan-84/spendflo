import { createHash } from "node:crypto";

/** Safety checks for remote MCP servers (pure, so they can be tested). */

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?fc|\[?fd|\[?fe80)/i;

export const isPrivateAddress = (a: string) => PRIVATE_HOST.test(a.replace(/^::ffff:/i, ""));

/** https only in production, no private addresses. Local http is allowed only when ALLOW_LOCAL_MCP=1 (tests). */
export function assertSafeUrl(raw: string, env: { allowLocal?: boolean } = { allowLocal: process.env.ALLOW_LOCAL_MCP === "1" }): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("That is not a valid URL"); }
  if (env.allowLocal && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return u;
  if (u.protocol !== "https:") throw new Error("MCP servers must use https");
  if (isPrivateAddress(u.hostname) || !u.hostname.includes(".")) throw new Error("That address is private. Use the server's public https URL");
  if (u.username || u.password) throw new Error("Put the token in the token field, not in the URL");
  return u;
}

export type ToolDef = { name: string; description: string; inputSchema: Record<string, unknown> };

/** A stable fingerprint of a tool's definition, so a changed tool is noticed. */
export function toolHash(t: ToolDef): string {
  const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;
  return createHash("sha256").update(JSON.stringify({ n: t.name, d: t.description ?? "", s: sorted(t.inputSchema ?? {}) })).digest("hex").slice(0, 32);
}
