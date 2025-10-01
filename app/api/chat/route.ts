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

    const response = await openai.responses.create({
      model: 'gpt-5-mini',
      input: input,
      reasoning: {
        effort: 'minimal'
      },
      text: {
        verbosity: 'low'
      }
    });

    const reply = response.output_text;

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}