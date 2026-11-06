import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/handler";
import { removeStep, updateStep, type StepPatch } from "@/lib/campaigns/actions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = (await req.json().catch(() => ({}))) as StepPatch;
  return withUser(async ({ user, db }) => {
    const r = await updateStep(db, user, id, patch);
    return { movedNote: r.movedNote };
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async ({ user, db }) => {
    await removeStep(db, user, id);
    return {};
  });
}
