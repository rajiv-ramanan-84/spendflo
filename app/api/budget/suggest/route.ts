import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { department, vendor, purpose, amount, contractTerm, availableBudgets } = body;

    if (!department || !vendor || !purpose || !availableBudgets || availableBudgets.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Format available budgets for AI
    const budgetsList = availableBudgets
      .map((b: any, i: number) =>
        `${i + 1}. ${b.subCategory} - $${b.budgetedAmount.toLocaleString()} budgeted, $${b.available.toLocaleString()} available`
      )
      .join('\n');

    const prompt = `You are a financial planning assistant helping to match a procurement request to the correct budget category.

Department: ${department}
Vendor: ${vendor}
Purpose: ${purpose}
Amount: $${amount}
Contract Term: ${contractTerm}

Available Budget Categories for ${department}:
${budgetsList}

Task: Determine which budget category this request should be charged to.

Consider:
- The vendor name and what they typically provide
- The stated purpose of the request
- The contract term and amount
- Industry-standard categorization (e.g., AWS → Software/Infrastructure, QuickBooks → Accounting software, LinkedIn Recruiter → HR software)

Respond in JSON format:
{
  "suggestedCategory": "exact subCategory name from the list above",
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation (1-2 sentences) why this category fits",
  "alternativeMessage": "if confidence is low, suggest contacting FP&A"
}

If confidence is LOW (you're not sure which category fits), set suggestedCategory to null and provide a helpful alternativeMessage.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract JSON from response
    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from AI');
    }

    // Parse JSON from the response (handle potential markdown code blocks)
    let responseText = content.text.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/```\n?/g, '');
    }

    const suggestion = JSON.parse(responseText);

    // Validate the suggested category exists
    if (suggestion.suggestedCategory) {
      const matchingBudget = availableBudgets.find(
        (b: any) => b.subCategory === suggestion.suggestedCategory
      );

      if (!matchingBudget) {
        console.warn('[Budget Suggest] AI suggested non-existent category:', suggestion.suggestedCategory);
        suggestion.confidence = 'low';
        suggestion.suggestedCategory = null;
        suggestion.alternativeMessage =
          'Unable to automatically match this request to a budget category. Please contact the FP&A team for assistance.';
      }
    }

    return NextResponse.json({
      success: true,
      suggestion,
    });
  } catch (error: any) {
    console.error('[Budget Suggest] Error:', error);
    return NextResponse.json(
      { error: 'Failed to suggest budget category', details: error.message },
      { status: 500 }
    );
  }
}
