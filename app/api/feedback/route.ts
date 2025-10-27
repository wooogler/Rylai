import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';

const useLocalAPI = process.env.NEXT_PUBLIC_USE_LOCAL_API === 'true';

const openai = new OpenAI({
  apiKey: useLocalAPI ? 'echolab-1234' : process.env.OPENAI_API_KEY,
  baseURL: useLocalAPI ? 'http://localhost:8000/v1' : undefined,
});

interface ConversationMessage {
  sender: 'user' | 'other';
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, feedbackPersona, feedbackInstruction } = await req.json();

    // Build conversation context
    const conversationContext = conversationHistory
      .map((msg: ConversationMessage) => `${msg.sender === 'user' ? 'User' : 'Predator'}: ${msg.text}`)
      .join('\n');

    const input = `${feedbackPersona}

Conversation:
${conversationContext}

${feedbackInstruction}

IMPORTANT: Format your response using Markdown. Use headings (##), bullet points (-), bold (**), and other Markdown formatting to make the feedback clear and well-structured.`;

    const response = await openai.chat.completions.create({
      model: useLocalAPI ? 'mistral-7b-instruct-v0.3' : 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: input
        }
      ],
      max_tokens: 300
    });

    const feedback = response.choices[0].message.content || '';

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate feedback' },
      { status: 500 }
    );
  }
}
