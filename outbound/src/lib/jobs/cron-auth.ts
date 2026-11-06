import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Cron routes accept only `Authorization: Bearer $CRON_SECRET` (Vercel Cron and pg_net both send it). */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
