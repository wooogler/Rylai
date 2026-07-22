import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { resetEvents } from '@/lib/db/schema';
import { getSessionUserId } from '@/lib/auth/session';

// POST — log that the acting learner used Restart (one scenario) or Reset all (the module).
// One row per confirmed action, so an educator can see how often a participant started over.
// The actor is the session user, never a body-supplied id: these rows are participant
// research data and must not be forgeable for someone else's account.
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const { kind, scenarioId } = await req.json();
    if (kind !== 'restart' && kind !== 'reset_all') {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
    }
    // A Restart names its scenario; Reset all is module-wide and stores none.
    if (kind === 'restart' && typeof scenarioId !== 'number') {
      return NextResponse.json({ error: 'scenarioId is required for a restart' }, { status: 400 });
    }

    await db.insert(resetEvents).values({
      userId,
      kind,
      scenarioId: kind === 'restart' ? scenarioId : null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error recording reset event:', error);
    return NextResponse.json({ error: 'Failed to record reset event' }, { status: 500 });
  }
}
