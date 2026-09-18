import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CLAUDE_MODEL, EVIDENCE_COACH_SYSTEM_PROMPT, PROPOSE_ACTIONS_TOOL } from '@/lib/aiPrompts';

export const runtime = 'nodejs';

const requestSchema = z.object({
  context: z.object({
    workshop: z.object({ goal: z.string(), companyContext: z.string() }),
    activePhase: z.object({ id: z.string(), name: z.string(), prompt: z.string(), minutesRemaining: z.number() }),
    cards: z.array(z.any()),
    evidence: z.array(z.any()),
    recentMessages: z.array(z.any()),
  }),
  userMessage: z.string().min(1),
  focusCardId: z.string().optional(),
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

  const compact = {
    workshop: body.context.workshop,
    activePhase: body.context.activePhase,
    focusCard: body.focusCardId ? body.context.cards.find((c: any) => c.id === body.focusCardId) : undefined,
    cardsSample: body.context.cards.slice(-20),
    evidenceSample: body.context.evidence.slice(-30),
    recentMessages: body.context.recentMessages.slice(-10),
  };

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: EVIDENCE_COACH_SYSTEM_PROMPT,
      tools: [PROPOSE_ACTIONS_TOOL],
      messages: [
        {
          role: 'user',
          content: `Workshop context (compact JSON):\n${JSON.stringify(compact)}\n\nParticipant message: "${body.userMessage}"`,
        },
      ],
    });

    let message = '';
    let proposedActions: unknown[] = [];
    for (const block of response.content) {
      if (block.type === 'text') message += block.text;
      else if (block.type === 'tool_use' && block.name === 'propose_actions') {
        const input = block.input as { actions?: unknown[] };
        if (Array.isArray(input.actions)) proposedActions = input.actions;
      }
    }
    if (!message) {
      message = proposedActions.length ? 'Here is what I would change based on the evidence.' : 'Could not evaluate that claim - try adding more detail.';
    }

    return NextResponse.json({ message, proposedActions });
  } catch (e: any) {
    return NextResponse.json({ error: `Claude request failed: ${e.message ?? String(e)}` }, { status: 502 });
  }
}
