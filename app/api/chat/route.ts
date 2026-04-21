import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { getModelById, getOpenRouterConfig, DEFAULT_MODEL_ID, VT_CUSTOM_BASE_URL } from '@/lib/ai-models';

const vtHttpsAgent = new https.Agent({ rejectUnauthorized: false });

function vtFetch(url: string, init: { method: string; headers?: Record<string, string>; body?: string }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: init.method,
        headers: init.headers,
        agent: vtHttpsAgent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? 0,
            json: () => Promise.resolve(JSON.parse(body)),
          });
        });
      }
    );
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

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

async function handleVtCustom(
  userMessage: string,
  vtSessionId: string | null,
  conversationHistory: Array<{ sender: 'user' | 'other'; text: string }>
): Promise<NextResponse> {
  let sessionId = vtSessionId;

  if (!sessionId) {
    const sessionRes = await vtFetch(`${VT_CUSTOM_BASE_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initial_history: conversationHistory.map(msg => ({
          speaker: msg.sender === 'other' ? 'PRED' : 'USER',
          text: msg.text,
        })),
      }),
    });
    if (!sessionRes.ok) {
      throw new Error(`Failed to create VT session: ${sessionRes.status}`);
    }
    const sessionData = await sessionRes.json() as { session_id: string };
    sessionId = sessionData.session_id;
  }

  const turnRes = await vtFetch(`${VT_CUSTOM_BASE_URL}/sessions/${sessionId}/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ victim_message: userMessage }),
  });

  if (!turnRes.ok) {
    throw new Error(`VT turn request failed: ${turnRes.status}`);
  }

  const turnData = await turnRes.json() as { predator_response: string; stage: number; stage_label: string };

  return NextResponse.json({
    reply: turnData.predator_response,
    vtSessionId: sessionId,
    stage: turnData.stage,
    stageLabel: turnData.stage_label,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, systemMessage, commonSystemPrompt, userMessage, modelId, vtSessionId } = await req.json();

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

    // VT Custom: session-based API
    if (model.provider === 'vt-custom') {
      return await handleVtCustom(userMessage, vtSessionId ?? null, conversationHistory);
    }

    // Get appropriate OpenAI client for this model
    const openai = getOpenAIClient(selectedModelId);

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
      model: model.modelId,
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
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}