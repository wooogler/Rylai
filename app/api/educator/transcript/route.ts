import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import {
  users,
  scenarios,
  userMessages,
  userFeedbacks,
  archivedMessages,
  archivedFeedbacks,
} from '@/lib/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { getSessionUserId } from '@/lib/auth/session';

// One participant's conversation for one scenario, as read by the educator: the live run plus
// every earlier run preserved when they used Restart / Reset all (see archivedMessages).
//
// Doubly scoped — the participant must be a student of the session educator AND the scenario
// must be one the educator owns. Without both checks a `userId` in the query string would let
// any educator read any other class's transcripts.

export interface TranscriptMessage {
  messageId: string;
  text: string;
  sender: 'user' | 'other';
  stage: number | null;
  classification: 'protective' | 'neutral' | 'vulnerable' | null;
  responseType: string | null;
  timestamp: number;
  // The feedback the learner saw on this reply, if any.
  feedback: string | null;
}

export interface TranscriptRun {
  // The reset that ended this run; null for the run still in progress.
  archivedAt: number | null;
  messages: TranscriptMessage[];
}

export async function GET(request: NextRequest) {
  try {
    const sessionUserId = await getSessionUserId();
    if (!sessionUserId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const educator = await db.query.users.findFirst({
      where: and(eq(users.id, sessionUserId), eq(users.userType, 'admin'), isNull(users.educatorId)),
      columns: { id: true },
    });
    if (!educator) {
      return NextResponse.json({ error: 'Educator account required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const scenarioIdRaw = searchParams.get('scenarioId');
    const scenarioId = scenarioIdRaw ? parseInt(scenarioIdRaw, 10) : NaN;
    if (!userId || Number.isNaN(scenarioId)) {
      return NextResponse.json({ error: 'userId and scenarioId are required' }, { status: 400 });
    }

    const student = await db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.educatorId, educator.id)),
      columns: { id: true, username: true },
    });
    const scenario = await db.query.scenarios.findFirst({
      where: and(eq(scenarios.id, scenarioId), eq(scenarios.userId, educator.id)),
      columns: { id: true, name: true },
    });
    if (!student || !scenario) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [liveMsgs, liveFbs, oldMsgs, oldFbs] = await Promise.all([
      db.query.userMessages.findMany({
        where: and(eq(userMessages.userId, userId), eq(userMessages.scenarioId, scenarioId)),
        orderBy: [asc(userMessages.timestamp)],
      }),
      db.query.userFeedbacks.findMany({
        where: and(eq(userFeedbacks.userId, userId), eq(userFeedbacks.scenarioId, scenarioId)),
      }),
      db.query.archivedMessages.findMany({
        where: and(eq(archivedMessages.userId, userId), eq(archivedMessages.scenarioId, scenarioId)),
        orderBy: [asc(archivedMessages.archivedAt), asc(archivedMessages.timestamp)],
      }),
      db.query.archivedFeedbacks.findMany({
        where: and(eq(archivedFeedbacks.userId, userId), eq(archivedFeedbacks.scenarioId, scenarioId)),
      }),
    ]);

    // Feedback is looked up per (run, messageId) — message ids repeat across runs, since preset
    // messages use ids derived from the scenario, so the run has to be part of the key.
    const fbKey = (archivedAt: number | null, messageId: string) => `${archivedAt ?? 'live'}::${messageId}`;
    const feedbackByKey = new Map<string, string>();
    for (const f of liveFbs) feedbackByKey.set(fbKey(null, f.messageId), f.feedbackText);
    for (const f of oldFbs) {
      feedbackByKey.set(fbKey(f.archivedAt.getTime(), f.messageId), f.feedbackText);
    }

    // Group the archived rows by the reset that produced them, oldest run first.
    const runsByStamp = new Map<number, TranscriptMessage[]>();
    for (const m of oldMsgs) {
      const stamp = m.archivedAt.getTime();
      if (!runsByStamp.has(stamp)) runsByStamp.set(stamp, []);
      runsByStamp.get(stamp)!.push({
        messageId: m.messageId,
        text: m.text,
        sender: m.sender,
        stage: m.stage ?? null,
        classification: m.classification ?? null,
        responseType: m.responseType ?? null,
        timestamp: m.timestamp.getTime(),
        feedback: feedbackByKey.get(fbKey(stamp, m.messageId)) ?? null,
      });
    }

    const runs: TranscriptRun[] = [...runsByStamp.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([archivedAt, messages]) => ({ archivedAt, messages }));

    // The live run always comes last, even when empty — "they reset and haven't replied since"
    // is itself worth seeing.
    runs.push({
      archivedAt: null,
      messages: liveMsgs.map((m) => ({
        messageId: m.messageId,
        text: m.text,
        sender: m.sender,
        stage: m.stage ?? null,
        classification: m.classification ?? null,
        responseType: m.responseType ?? null,
        timestamp: m.timestamp.getTime(),
        feedback: feedbackByKey.get(fbKey(null, m.messageId)) ?? null,
      })),
    });

    return NextResponse.json({
      username: student.username,
      scenarioName: scenario.name,
      runs,
    });
  } catch (error) {
    console.error('Error loading transcript:', error);
    return NextResponse.json({ error: 'Failed to load transcript' }, { status: 500 });
  }
}
