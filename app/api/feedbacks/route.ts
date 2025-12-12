import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { userFeedbacks } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// GET - Load feedbacks for a scenario
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const scenarioId = searchParams.get('scenarioId');

    if (!userId || !scenarioId) {
      return NextResponse.json({ error: 'User ID and Scenario ID are required' }, { status: 400 });
    }

    const data = await db.query.userFeedbacks.findMany({
      where: and(
        eq(userFeedbacks.userId, userId),
        eq(userFeedbacks.scenarioId, parseInt(scenarioId))
      )
    });

    const feedbackMap: Record<string, string> = {};
    (data || []).forEach(row => {
      feedbackMap[row.messageId] = row.feedbackText;
    });

    return NextResponse.json(feedbackMap);
  } catch (error) {
    console.error('Error loading feedbacks:', error);
    return NextResponse.json({ error: 'Failed to load feedbacks' }, { status: 500 });
  }
}

// POST - Save feedback
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, scenarioId, messageId, feedbackText } = body;

    if (!userId || !scenarioId || !messageId || !feedbackText) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if feedback already exists
    const existing = await db.query.userFeedbacks.findFirst({
      where: and(
        eq(userFeedbacks.userId, userId),
        eq(userFeedbacks.scenarioId, scenarioId),
        eq(userFeedbacks.messageId, messageId)
      )
    });

    if (existing) {
      // Update existing feedback
      await db.update(userFeedbacks)
        .set({ feedbackText, createdAt: new Date() })
        .where(eq(userFeedbacks.id, existing.id));
    } else {
      // Insert new feedback
      await db.insert(userFeedbacks).values({
        id: crypto.randomUUID(),
        userId,
        scenarioId,
        messageId,
        feedbackText,
        createdAt: new Date(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving feedback:', error);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}
