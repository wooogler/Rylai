import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { VT_CUSTOM_BASE_URL } from '@/lib/ai-models';

// The VT Custom (StagePilot) endpoint uses a self-signed certificate.
const vtHttpsAgent = new https.Agent({ rejectUnauthorized: false });

function vtFetch(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string }
): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
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

interface ConversationMessage {
  sender: 'user' | 'other';
  text: string;
}

interface SessionConfig {
  age: number | null;
  autoStage: boolean;
  stage: number;
  minStage: number;
  maxStage: number;
  predName: string | null;
}

async function createVtSession(
  conversationHistory: ConversationMessage[],
  config: SessionConfig
): Promise<string> {
  const sessionRes = await vtFetch(`${VT_CUSTOM_BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initial_history: conversationHistory.map((msg) => ({
        speaker: msg.sender === 'other' ? 'PRED' : 'USER',
        text: msg.text,
      })),
      age: config.age,
      pred_name: config.predName,
      auto_stage: config.autoStage,
      stage: config.stage,
      min_stage: config.minStage,
      max_stage: config.maxStage,
    }),
  });
  if (!sessionRes.ok) {
    throw new Error(`Failed to create VT session: ${sessionRes.status}`);
  }
  const sessionData = (await sessionRes.json()) as { session_id: string };
  return sessionData.session_id;
}

async function vtTurn(
  sessionId: string,
  userMessage: string,
  stageOverride: number | null
): Promise<{ ok: boolean; status: number; data?: { predator_response: string; stage: number; stage_label: string; stage_capped?: boolean } }> {
  const turnRes = await vtFetch(`${VT_CUSTOM_BASE_URL}/sessions/${sessionId}/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ victim_message: userMessage, stage: stageOverride }),
  });
  if (!turnRes.ok) {
    return { ok: false, status: turnRes.status };
  }
  const data = (await turnRes.json()) as {
    predator_response: string;
    stage: number;
    stage_label: string;
    // true when the model's raw prediction exceeded max_stage and was clamped.
    stage_capped?: boolean;
  };
  return { ok: true, status: turnRes.status, data };
}

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, userMessage, vtSessionId, stageOverride, age, autoStage, stage, minStage, maxStage, predatorName } = await req.json();
    const history: ConversationMessage[] = conversationHistory ?? [];
    const turnStage: number | null = stageOverride ?? null;
    const sessionConfig: SessionConfig = {
      age: typeof age === 'number' ? age : null,
      autoStage: autoStage !== false, // default true
      stage: typeof stage === 'number' ? stage : 1,
      minStage: typeof minStage === 'number' ? minStage : 1, // default 1 = no floor
      maxStage: typeof maxStage === 'number' ? maxStage : 6, // default 6 = no cap
      predName: typeof predatorName === 'string' && predatorName.trim() ? predatorName.trim() : null,
    };

    // Reuse the existing VT session, or seed a new one from the conversation history.
    let sessionId: string = vtSessionId ?? null;
    if (!sessionId) {
      sessionId = await createVtSession(history, sessionConfig);
    }

    let turn = await vtTurn(sessionId, userMessage, turnStage);

    // Graceful fallback: the saved session may have expired/been cleared on the
    // VT server. Recreate it from history and retry once.
    if (!turn.ok && vtSessionId) {
      sessionId = await createVtSession(history, sessionConfig);
      turn = await vtTurn(sessionId, userMessage, turnStage);
    }

    if (!turn.ok || !turn.data) {
      throw new Error(`VT turn request failed: ${turn.status}`);
    }

    // pred_name is applied at session creation, so new sessions get the real name from
    // the model. As a fallback (e.g. a session created before pred_name existed), also
    // substitute any leftover [PredName] token in the reply.
    const reply = sessionConfig.predName
      ? (turn.data.predator_response || '').replace(/\[PredName\]/gi, sessionConfig.predName)
      : turn.data.predator_response;

    return NextResponse.json({
      reply,
      vtSessionId: sessionId,
      stage: turn.data.stage,
      stageLabel: turn.data.stage_label,
      stageCapped: turn.data.stage_capped ?? false,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}
