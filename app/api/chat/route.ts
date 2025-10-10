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
    const { conversationHistory, systemMessage, commonSystemPrompt, userMessage } = await req.json();

    // Build conversation context
    const conversationContext = conversationHistory
      .map((msg: ConversationMessage) => `${msg.sender === 'user' ? 'User' : 'Predator'}: ${msg.text}`)
      .join('\n');

    // Merge scenario-specific prompt with common prompt
    const fullSystemPrompt = commonSystemPrompt
      ? `${systemMessage}\n\n${commonSystemPrompt}`
      : systemMessage;

    // Combine system prompt, conversation history, and user message
    const input = `${fullSystemPrompt}

Previous conversation:
${conversationContext}

User: ${userMessage}

Respond as the character in a short, casual text message (1-2 sentences). Do not use emojis.`;

    const response = await openai.chat.completions.create({
      model: useLocalAPI ? 'mistral-7b-instruct-v0.3' : 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: input
        }
      ],
      max_tokens: 128
    });

    const reply = response.choices[0].message.content || '';

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}