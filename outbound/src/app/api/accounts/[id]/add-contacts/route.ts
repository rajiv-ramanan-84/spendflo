import type { NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/handler";
import { ActionError } from "@/lib/campaigns/actions";
import { addFoundContacts } from "@/lib/contacts/finder";

export const maxDuration = 300;

const Person = z.object({
  full_name: z.string().min(2).max(120),
  title: z.string().max(200),
  linkedin_url: z.string().max(300),
  location: z.string().max(200).nullable(),
  source_url: z.string().max(500).nullable(),
  evidence: z.string().max(400),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = z.object({ people: z.array(Person).min(1).max(8) }).safeParse(await req.json().catch(() => null));
  return withUser(({ user, db }) => {
    if (!parsed.success) throw new ActionError("Pick at least one person to add");
    return addFoundContacts(db, user, { accountId: id, people: parsed.data.people });
  });
}
