import type { Channel } from "./schemas";

/** Copy checks shared by draft validation and the live editor. Pure, browser-safe. */

export const TOKEN_RE = /\{[a-z_ ]+\}|\[(first name|name|company|title)\]/i;

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export function copyIssues(channel: Channel, subject: string | null, body: string | null, limits: { emailWords: number; connectChars: number }): string[] {
  const issues: string[] = [];
  const text = `${subject ?? ""}\n${body ?? ""}`;
  if (TOKEN_RE.test(text)) issues.push("has an unresolved placeholder like {first_name}");
  if (text.includes("—")) issues.push("contains an em dash");
  if (channel === "linkedin_connect" && (body ?? "").length > limits.connectChars) {
    issues.push(`connect note is ${(body ?? "").length} characters (max ${limits.connectChars})`);
  }
  if (channel === "email") {
    const w = wordCount(body ?? "");
    if (w > limits.emailWords) issues.push(`email is ${w} words (flag above ${limits.emailWords})`);
    if (!subject?.trim()) issues.push("email has no subject");
  }
  if (channel !== "call" && !body?.trim()) issues.push("has no copy");
  return issues;
}

