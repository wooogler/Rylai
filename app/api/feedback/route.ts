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
    const { conversationHistory, userMessage, predatorResponse } = await req.json();

    // Build conversation context
    const conversationContext = conversationHistory
      .map((msg: ConversationMessage) => `${msg.sender === 'user' ? 'User' : 'Predator'}: ${msg.text}`)
      .join('\n');

    const input = `You are an educational assistant helping learners recognize online grooming tactics.

Previous conversation:
${conversationContext}

Latest exchange:
- User's message: "${userMessage}"
- Predator's response: "${predatorResponse}"

Provide constructive feedback for the learner focusing on:
1. What grooming tactics the predator is using (if any)
2. Whether the user's response was safe or potentially risky
3. Specific suggestions for safer responses

Keep the feedback concise (2-3 sentences), educational, and supportive. Focus on helping the learner identify red flags and practice safer online communication.`;

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
