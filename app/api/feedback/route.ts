import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { FEEDBACK_MODEL } from '@/lib/ai-models';
import { buildFeedbackAndClassificationInput } from '@/lib/feedback-prompts';

interface ConversationMessage {
  sender: 'user' | 'other';
  text: string;
}

interface FeedbackResult {
  feedback: string;
  classification: 'protective' | 'neutral' | 'risky';
  tacticRecognized: boolean;
  protectiveStrategy: boolean;
  rationale: string;
}

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    feedback: { type: 'string' },
    classification: { type: 'string', enum: ['protective', 'neutral', 'risky'] },
    tacticRecognized: { type: 'boolean' },
    protectiveStrategy: { type: 'boolean' },
    rationale: { type: 'string' },
  },
  required: ['feedback', 'classification', 'tacticRecognized', 'protectiveStrategy', 'rationale'],
} as const;

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, stage, age } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });

    const conversationContext = (conversationHistory as ConversationMessage[])
      .map((msg) => `${msg.sender === 'user' ? 'User' : 'Predator'}: ${msg.text}`)
      .join('\n');

    const input = buildFeedbackAndClassificationInput(stage, conversationContext, age);

    // FEEDBACK_MODEL is a reasoning model (gpt-5.x). Low reasoning effort for a short
    // task; structured outputs guarantee a parseable JSON object.
    const response = await openai.responses.create({
      model: FEEDBACK_MODEL,
      input,
      reasoning: { effort: 'low' },
      max_output_tokens: 1200,
      text: {
        format: {
          type: 'json_schema',
          name: 'rylai_feedback',
          schema: RESULT_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    });

    const raw = response.output_text || '';
    let result: FeedbackResult;
    try {
      result = JSON.parse(raw) as FeedbackResult;
    } catch {
      // Fallback: if structured parsing fails, surface the text as feedback only.
      result = {
        feedback: raw,
        classification: 'neutral',
        tacticRecognized: false,
        protectiveStrategy: false,
        rationale: 'Could not parse structured classification.',
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate feedback' },
      { status: 500 }
    );
  }
}
