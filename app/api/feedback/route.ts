import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { getModelById, getOpenRouterConfig, DEFAULT_MODEL_ID } from '@/lib/ai-models';

// Legacy local API support
const useLocalAPI = process.env.NEXT_PUBLIC_USE_LOCAL_API === 'true';

function getOpenAIClient(modelId: string) {
  const model = getModelById(modelId);

  if (!model) {
    throw new Error(`Model ${modelId} not found`);
  }

  // Local model
  if (model.provider === 'local') {
    return new OpenAI({
      apiKey: 'echolab-1234',
      baseURL: 'http://localhost:8000/v1',
    });
  }

  // OpenRouter models
  if (model.provider === 'openrouter') {
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }
    const config = getOpenRouterConfig(openRouterApiKey);
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
    });
  }

  // Direct OpenAI
  if (model.provider === 'openai') {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    return new OpenAI({
      apiKey: openaiApiKey,
    });
  }

  throw new Error(`Unsupported provider: ${model.provider}`);
}

interface ConversationMessage {
  sender: 'user' | 'other';
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, feedbackPersona, feedbackInstruction, modelId } = await req.json();

    // Determine which model to use
    let selectedModelId = modelId || DEFAULT_MODEL_ID;

    // Legacy support: if NEXT_PUBLIC_USE_LOCAL_API is true, use local model
    if (useLocalAPI && !modelId) {
      selectedModelId = 'local-mistral-7b';
    }

    const model = getModelById(selectedModelId);
    if (!model) {
      return NextResponse.json(
        { error: `Model ${selectedModelId} not found` },
        { status: 400 }
      );
    }

    // Get appropriate OpenAI client for this model
    const openai = getOpenAIClient(selectedModelId);

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
      model: model.modelId,
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
    console.error('Feedback API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate feedback' },
      { status: 500 }
    );
  }
}
