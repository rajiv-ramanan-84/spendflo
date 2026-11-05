import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { preparedCopy } from "@/lib/steps/execute";

/** The exact text to copy or send: edited copy with tokens resolved. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async ({ db }) => {
    const p = await preparedCopy(db, id);
    return { subject: p.subject, body: p.body, unresolved: p.unresolved, linkedinUrl: p.contact.linkedin_url, email: p.contact.email, phone: p.contact.phone };
  });
}
