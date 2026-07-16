import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { buildFeedbackAndClassificationInput } from '@/lib/feedback-prompts';
import { runFeedbackModel } from '@/lib/feedback-runner';
import { packFeedback } from '@/lib/feedback-format';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface ConversationMessage {
  sender: 'user' | 'other';
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, stage, adminUserId } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });

    // Per-educator prompt overrides (owner of the scenario being practiced). Falls
    // back to system defaults when the educator hasn't customized anything.
    let feedbackConfig = null;
    let classificationConfig = null;
    if (adminUserId) {
      const owner = await db.query.users.findFirst({
        where: eq(users.id, adminUserId),
        columns: { feedbackConfig: true, classificationConfig: true },
      });
      feedbackConfig = owner?.feedbackConfig ?? null;
      classificationConfig = owner?.classificationConfig ?? null;
    }

    const conversationContext = (conversationHistory as ConversationMessage[])
      .map((msg) => `${msg.sender === 'user' ? 'User' : 'Online stranger'}: ${msg.text}`)
      .join('\n');

    const input = buildFeedbackAndClassificationInput(
      stage,
      conversationContext,
      feedbackConfig,
      classificationConfig
    );

    const result = await runFeedbackModel(openai, input);

    // Pack the three feedback parts into the wire string, honoring the educator's part
    // toggles + display mode. Classification fields are returned alongside as before.
    const feedback = packFeedback(
      { yourResponse: result.yourResponse, stageIntent: result.stageIntent, nextMove: result.nextMove },
      feedbackConfig
    );
    return NextResponse.json({
      feedback,
      classification: result.classification,
      responseType: result.responseType,
      tacticRecognized: result.tacticRecognized,
      protectiveStrategy: result.protectiveStrategy,
      rationale: result.rationale,
    });
  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate feedback' },
      { status: 500 }
    );
  }
}
