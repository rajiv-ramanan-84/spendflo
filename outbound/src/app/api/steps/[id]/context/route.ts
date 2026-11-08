import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { stepContext } from "@/lib/steps/execute";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(({ db }) => stepContext(db, id));
}
