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
    const { conversationHistory, systemMessage, userMessage } = await req.json();

    // Build messages array from conversation history
    const messages = conversationHistory.map((msg: ConversationMessage) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text,
    }));

    // Add the new user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMessage },
        ...messages,
      ],
      temperature: 0.8,
      max_tokens: 150,
    });

    const reply = completion.choices[0].message.content;

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}