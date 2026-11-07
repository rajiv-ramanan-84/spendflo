import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { findContacts } from "@/lib/contacts/finder";

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { lookingFor?: string };
  return withUser(({ user, db }) => findContacts(db, user, { accountId: id, lookingFor: String(b.lookingFor ?? "") }));
}
