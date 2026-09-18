import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CLAUDE_MODEL, FACILITATOR_SYSTEM_PROMPT, PROPOSE_ACTIONS_TOOL } from '@/lib/aiPrompts';

export const runtime = 'nodejs';

const contextSchema = z.object({
  workshop: z.object({ goal: z.string(), companyContext: z.string() }),
  activePhase: z.object({ id: z.string(), name: z.string(), prompt: z.string(), minutesRemaining: z.number() }),
  participants: z.array(z.object({ name: z.string(), role: z.string(), presence: z.string() })),
  cards: z.array(z.any()),
  evidence: z.array(z.any()),
  theses: z.array(z.any()),
  decisions: z.array(z.any()),
  recentMessages: z.array(z.any()),
});

const requestSchema = z.object({
  context: contextSchema,
  userMessage: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured on the server. Set it in .env.local and restart the dev server.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = requestSchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json({ error: `Invalid request: ${e.message}` }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });

  const contextSummary = buildContextSummary(body.context);

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: FACILITATOR_SYSTEM_PROMPT,
      tools: [PROPOSE_ACTIONS_TOOL],
      messages: [
        {
          role: 'user',
          content: `Current workshop context (compact JSON):\n${contextSummary}\n\nFacilitator, respond to the group. Participant message: "${body.userMessage}"`,
        },
      ],
    });

    const { message, proposedActions } = extractMessageAndActions(response);
    return NextResponse.json({ message, proposedActions });
  } catch (e: any) {
    return NextResponse.json({ error: `Claude request failed: ${e.message ?? String(e)}` }, { status: 502 });
  }
}

function buildContextSummary(ctx: z.infer<typeof contextSchema>) {
  // Trim to keep the prompt compact: full cards/evidence would blow the context window
  // in a long workshop, so we send counts + the most recent/most relevant items.
  const compact = {
    workshop: ctx.workshop,
    activePhase: ctx.activePhase,
    participants: ctx.participants,
    cardCount: ctx.cards.length,
    cardsSample: ctx.cards.slice(-30),
    evidenceCount: ctx.evidence.length,
    theses: ctx.theses,
    decisions: ctx.decisions,
    recentMessages: ctx.recentMessages.slice(-10),
  };
  return JSON.stringify(compact);
}

function extractMessageAndActions(response: Anthropic.Messages.Message) {
  let message = '';
  let proposedActions: unknown[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      message += block.text;
    } else if (block.type === 'tool_use' && block.name === 'propose_actions') {
      const input = block.input as { actions?: unknown[] };
      if (Array.isArray(input.actions)) proposedActions = input.actions;
    }
  }

  if (!message) {
    message = proposedActions.length
      ? 'Here are some suggested next steps for the board.'
      : 'I do not have a response right now - try rephrasing your question.';
  }

  return { message, proposedActions };
}
