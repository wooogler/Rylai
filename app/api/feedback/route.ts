import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ConversationMessage {
  sender: 'user' | 'other';
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, userMessage, predatorResponse, feedbackPersona, feedbackInstruction } = await req.json();

    // Build conversation context
    const conversationContext = conversationHistory
      .map((msg: ConversationMessage) => `${msg.sender === 'user' ? 'User' : 'Predator'}: ${msg.text}`)
      .join('\n');

    const latestExchange = predatorResponse
      ? `Latest exchange:
- User's message: "${userMessage}"
- Predator's response: "${predatorResponse}"`
      : `Latest user message: "${userMessage}"`;

    const input = `${feedbackPersona}

Previous conversation:
${conversationContext}

${latestExchange}

${feedbackInstruction}`;

    const response = await openai.responses.create({
      model: 'gpt-5',
      input: input,
      reasoning: {
        effort: 'medium'
      },
      text: {
        verbosity: 'medium'
      }
    });

    const feedback = response.output_text;

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate feedback' },
      { status: 500 }
    );
  }
}
