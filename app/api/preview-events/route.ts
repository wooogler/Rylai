import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { previewEvents } from '@/lib/db/schema';

// POST - Log a preview-feedback event (draft reply + the feedback shown for it)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, scenarioId, draftText, feedbackText, classification, stage } = body;

    if (!userId || !scenarioId || draftText === undefined || feedbackText === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await db.insert(previewEvents).values({
      userId,
      scenarioId,
      draftText,
      feedbackText,
      classification: classification ?? null,
      stage: typeof stage === 'number' ? stage : null,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging preview event:', error);
    return NextResponse.json({ error: 'Failed to log preview event' }, { status: 500 });
  }
}
