import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { resumeTracks } from "@/lib/campaigns/actions";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(({ user, db }) => resumeTracks(db, user, id));
}
