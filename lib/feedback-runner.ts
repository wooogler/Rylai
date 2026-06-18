// Shared feedback-model runner: the structured-output schema and the OpenAI call,
// used by both /api/feedback (production) and /api/feedback/test (admin preview).

import { OpenAI } from 'openai';
import { FEEDBACK_MODEL } from './ai-models';
import { RESPONSE_TYPES, type ResponseType } from './db/schema';

export interface FeedbackResult {
  feedback: string;
  classification: 'protective' | 'neutral' | 'vulnerable';
  responseType: ResponseType;
  tacticRecognized: boolean;
  protectiveStrategy: boolean;
  rationale: string;
}

export const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    feedback: { type: 'string' },
    classification: { type: 'string', enum: ['protective', 'neutral', 'vulnerable'] },
    responseType: { type: 'string', enum: [...RESPONSE_TYPES] },
    tacticRecognized: { type: 'boolean' },
    protectiveStrategy: { type: 'boolean' },
    rationale: { type: 'string' },
  },
  required: [
    'feedback',
    'classification',
    'responseType',
    'tacticRecognized',
    'protectiveStrategy',
    'rationale',
  ],
} as const;

// Run the feedback model on a fully-assembled input string and parse the structured
// JSON result. FEEDBACK_MODEL is a reasoning model (gpt-5.x); low reasoning effort for
// a short task, and strict structured outputs guarantee a parseable object.
export async function runFeedbackModel(openai: OpenAI, input: string): Promise<FeedbackResult> {
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
  try {
    return JSON.parse(raw) as FeedbackResult;
  } catch {
    // Fallback: if structured parsing fails, surface the text as feedback only.
    return {
      feedback: raw,
      classification: 'neutral',
      responseType: 'none',
      tacticRecognized: false,
      protectiveStrategy: false,
      rationale: 'Could not parse structured classification.',
    };
  }
}
