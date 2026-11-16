import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAgent, type AgentEvent } from "@/lib/agent/loop";
import { buildAttachments } from "@/lib/agent/attachments";
import { loadAgentConfig } from "@/lib/agent/store";
import { ActionError } from "@/lib/campaigns/actions";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({ threadId: z.string().uuid().nullish(), text: z.string().trim().min(1).max(4000), page: z.string().max(200).nullish(), accountId: z.string().uuid().nullish(), contexts: z.array(z.object({ type: z.enum(["account", "contact"]), id: z.string().uuid() })).max(6).default([]), fileIds: z.array(z.string().uuid()).max(8).default([]) });

/** One chat turn, streamed as server-sent events: text, tool progress, approval cards, then done. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const db = supabaseAdmin();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });
  if (!db) return fail(500, "Database is not configured");
  if (!user.id) return fail(403, "Your account is not linked to the team list yet");
  if (!parsed.success) return fail(400, "Type a message first");
  const d = parsed.data;

  // A run the browser walked away from never finished; clear it so it does not block the next message.
  await db.from("agent_runs").update({ status: "failed", error: "Ended without finishing (the browser disconnected)", finished_at: new Date().toISOString() }).eq("user_id", user.id).eq("status", "running").lt("started_at", new Date(Date.now() - 90_000).toISOString());
  // One request at a time per person.
  const { count: running } = await db.from("agent_runs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "running").gte("started_at", new Date(Date.now() - 2 * 60_000).toISOString());
  if ((running ?? 0) > 0) return fail(429, "Still working on your last message. Give it a moment.");

  let threadId = d.threadId ?? null;
  if (threadId) {
    const { data: t } = await db.from("agent_threads").select("id").eq("id", threadId).eq("user_id", user.id).maybeSingle();
    if (!t) return fail(404, "Chat not found");
  } else {
    const { data: t, error } = await db.from("agent_threads").insert({ user_id: user.id, context: d.accountId ? { accountId: d.accountId } : {} }).select("id").single();
    if (error || !t) return fail(500, "Could not start a chat");
    threadId = t.id as string;
  }
  let accountName: string | null = null;
  if (d.accountId) {
    const { data: a } = await db.from("accounts").select("name").eq("id", d.accountId).maybeSingle();
    accountName = (a?.name as string | undefined) ?? null;
  }

  let attachments = null;
  try {
    attachments = await buildAttachments(db, user, await loadAgentConfig(db), { contexts: d.contexts, fileIds: d.fileIds });
  } catch (e) {
    return fail(e instanceof ActionError ? e.status : 500, e instanceof Error ? e.message : "Could not read the attachments");
  }

  const enc = new TextEncoder();
  const tid = threadId;
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());
  let open = true;
  const stream = new ReadableStream({
    cancel() { open = false; ac.abort(); },
    async start(controller) {
      // If the browser has gone, keep the run's bookkeeping going but stop writing to it.
      const send = (e: AgentEvent | { type: "thread"; threadId: string }) => { if (!open) return; try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { open = false; } };
      send({ type: "thread", threadId: tid });
      try {
        await runAgent({ db, user, threadId: tid, text: d.text, page: d.page ?? null, accountName, attachments, emit: send, signal: ac.signal });
      } catch (e) {
        console.error("agent run crashed:", e);
        send({ type: "error", message: "Something went wrong. Please try again." });
      }
      if (open) { try { controller.close(); } catch { /* already closed */ } }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}
