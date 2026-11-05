import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { dismissResponse } from "@/lib/responses/service";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(({ user, db }) => dismissResponse(db, user, id));
}
