import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { scenarioProgress, userMessages, userFeedbacks } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// GET - Load scenario progress for user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const data = await db.query.scenarioProgress.findMany({
      where: eq(scenarioProgress.userId, userId)
    });

    const progressMap: Record<number, { scenarioId: number; firstVisitedAt: Date; lastVisitedAt: Date; visitCount: number }> = {};
    (data || []).forEach(row => {
      progressMap[row.scenarioId] = {
        scenarioId: row.scenarioId,
        firstVisitedAt: new Date(row.firstVisitedAt),
        lastVisitedAt: new Date(row.lastVisitedAt),
        visitCount: row.visitCount,
      };
    });

    return NextResponse.json(progressMap);
  } catch (error) {
    console.error('Error loading scenario progress:', error);
    return NextResponse.json({ error: 'Failed to load scenario progress' }, { status: 500 });
  }
}

// POST - Track scenario visit
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, scenarioId } = body;

    if (!userId || !scenarioId) {
      return NextResponse.json({ error: 'User ID and Scenario ID are required' }, { status: 400 });
    }

    const existing = await db.query.scenarioProgress.findFirst({
      where: and(
        eq(scenarioProgress.userId, userId),
        eq(scenarioProgress.scenarioId, scenarioId)
      )
    });

    const now = Date.now();

    if (existing) {
      // Update existing progress
      await db.update(scenarioProgress)
        .set({
          lastVisitedAt: now,
          visitCount: existing.visitCount + 1,
        })
        .where(eq(scenarioProgress.id, existing.id));
    } else {
      // Create new progress entry
      await db.insert(scenarioProgress).values({
        id: crypto.randomUUID(),
        userId,
        scenarioId,
        firstVisitedAt: now,
        lastVisitedAt: now,
        visitCount: 1,
        createdAt: now,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking scenario visit:', error);
    return NextResponse.json({ error: 'Failed to track scenario visit' }, { status: 500 });
  }
}

// DELETE - Reset scenario progress
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const scenarioId = searchParams.get('scenarioId');

    if (!userId || !scenarioId) {
      return NextResponse.json({ error: 'User ID and Scenario ID are required' }, { status: 400 });
    }

    const scenarioIdInt = parseInt(scenarioId);

    // Use transaction to delete all related data
    await db.transaction(async (tx) => {
      // Delete progress
      await tx.delete(scenarioProgress).where(
        and(
          eq(scenarioProgress.userId, userId),
          eq(scenarioProgress.scenarioId, scenarioIdInt)
        )
      );

      // Delete messages
      await tx.delete(userMessages).where(
        and(
          eq(userMessages.userId, userId),
          eq(userMessages.scenarioId, scenarioIdInt)
        )
      );

      // Delete feedbacks
      await tx.delete(userFeedbacks).where(
        and(
          eq(userFeedbacks.userId, userId),
          eq(userFeedbacks.scenarioId, scenarioIdInt)
        )
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resetting scenario progress:', error);
    return NextResponse.json({ error: 'Failed to reset scenario progress' }, { status: 500 });
  }
}
