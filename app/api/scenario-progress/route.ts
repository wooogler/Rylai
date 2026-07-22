import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import {
  scenarioProgress,
  userMessages,
  userFeedbacks,
  archivedMessages,
  archivedFeedbacks,
} from '@/lib/db/schema';
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

    const progressMap: Record<number, {
      scenarioId: number; firstVisitedAt: Date; lastVisitedAt: Date; visitCount: number;
      protectiveCount: number; neutralCount: number; vulnerableCount: number;
      protectiveRate: number | null; masteryReachedAt: number | null;
      comfortExitAt: number | null; completedAt: number | null;
    }> = {};
    (data || []).forEach(row => {
      progressMap[row.scenarioId] = {
        scenarioId: row.scenarioId,
        firstVisitedAt: new Date(row.firstVisitedAt),
        lastVisitedAt: new Date(row.lastVisitedAt),
        visitCount: row.visitCount,
        protectiveCount: row.protectiveCount,
        neutralCount: row.neutralCount,
        vulnerableCount: row.vulnerableCount,
        protectiveRate: row.protectiveRate ?? null,
        masteryReachedAt: row.masteryReachedAt ? row.masteryReachedAt.getTime() : null,
        comfortExitAt: row.comfortExitAt ? row.comfortExitAt.getTime() : null,
        completedAt: row.completedAt ? row.completedAt.getTime() : null,
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

    const now = new Date();

    if (existing) {
      await db.update(scenarioProgress)
        .set({
          lastVisitedAt: now,
          visitCount: existing.visitCount + 1,
        })
        .where(eq(scenarioProgress.id, existing.id));
    } else {
      await db.insert(scenarioProgress).values({
        userId,
        scenarioId,
        firstVisitedAt: now,
        lastVisitedAt: now,
        visitCount: 1,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking scenario visit:', error);
    return NextResponse.json({ error: 'Failed to track scenario visit' }, { status: 500 });
  }
}

// PATCH - Record a lifecycle event for a scenario: 'completed' (finished — advanced to the
// next scenario, ended the final chat, or the assessment reached its reply limit) or
// 'comfort_exit' ("I don't feel comfortable anymore."). Timestamps are sticky (first only).
// 'comfort_exit_undo' is the one exception: it clears comfort_exit_at so a mis-click can be
// taken back without destroying the conversation (Restart, the other way out, wipes it).
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, scenarioId, kind } = body;

    const KINDS = ['completed', 'comfort_exit', 'comfort_exit_undo'];
    if (!userId || !scenarioId || !KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
    }

    const now = new Date();

    const existing = await db.query.scenarioProgress.findFirst({
      where: and(
        eq(scenarioProgress.userId, userId),
        eq(scenarioProgress.scenarioId, scenarioId)
      )
    });

    // Undo only ever clears an existing stamp — never creates a row.
    if (kind === 'comfort_exit_undo') {
      if (existing?.comfortExitAt) {
        await db.update(scenarioProgress)
          .set({ comfortExitAt: null })
          .where(eq(scenarioProgress.id, existing.id));
      }
      return NextResponse.json({ success: true });
    }

    if (existing) {
      // Sticky: keep the first time each event happened.
      const stamp = kind === 'completed'
        ? (existing.completedAt ? {} : { completedAt: now })
        : (existing.comfortExitAt ? {} : { comfortExitAt: now });
      if (Object.keys(stamp).length > 0) {
        await db.update(scenarioProgress)
          .set(stamp)
          .where(eq(scenarioProgress.id, existing.id));
      }
    } else {
      const stamp = kind === 'completed' ? { completedAt: now } : { comfortExitAt: now };
      await db.insert(scenarioProgress).values({
        userId,
        scenarioId,
        firstVisitedAt: now,
        lastVisitedAt: now,
        visitCount: 1,
        ...stamp,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error recording scenario lifecycle:', error);
    return NextResponse.json({ error: 'Failed to record scenario lifecycle' }, { status: 500 });
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
    db.transaction((tx) => {
      // Preserve the conversation before it goes. Same transaction as the delete, so the
      // transcript is either fully archived or the reset doesn't happen at all — an educator
      // must never see a half-copied run. `archivedAt` is shared by every row of this reset
      // and identifies the run (see archivedMessages in schema.ts).
      const archivedAt = new Date();
      const msgs = tx
        .select()
        .from(userMessages)
        .where(and(eq(userMessages.userId, userId), eq(userMessages.scenarioId, scenarioIdInt)))
        .all();
      if (msgs.length > 0) {
        tx.insert(archivedMessages)
          .values(
            msgs.map((m) => ({
              userId: m.userId,
              scenarioId: m.scenarioId,
              archivedAt,
              messageId: m.messageId,
              text: m.text,
              sender: m.sender,
              stage: m.stage,
              classification: m.classification,
              responseType: m.responseType,
              tacticRecognized: m.tacticRecognized,
              protectiveStrategy: m.protectiveStrategy,
              rationale: m.rationale,
              timestamp: m.timestamp,
            }))
          )
          .run();

        const fbs = tx
          .select()
          .from(userFeedbacks)
          .where(and(eq(userFeedbacks.userId, userId), eq(userFeedbacks.scenarioId, scenarioIdInt)))
          .all();
        if (fbs.length > 0) {
          tx.insert(archivedFeedbacks)
            .values(
              fbs.map((f) => ({
                userId: f.userId,
                scenarioId: f.scenarioId,
                archivedAt,
                messageId: f.messageId,
                feedbackText: f.feedbackText,
              }))
            )
            .run();
        }
      }

      tx.delete(scenarioProgress).where(
        and(
          eq(scenarioProgress.userId, userId),
          eq(scenarioProgress.scenarioId, scenarioIdInt)
        )
      ).run();
      tx.delete(userMessages).where(
        and(
          eq(userMessages.userId, userId),
          eq(userMessages.scenarioId, scenarioIdInt)
        )
      ).run();
      tx.delete(userFeedbacks).where(
        and(
          eq(userFeedbacks.userId, userId),
          eq(userFeedbacks.scenarioId, scenarioIdInt)
        )
      ).run();
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resetting scenario progress:', error);
    return NextResponse.json({ error: 'Failed to reset scenario progress' }, { status: 500 });
  }
}
