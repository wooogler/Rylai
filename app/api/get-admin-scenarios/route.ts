import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { scenarios as scenariosTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionUserId } from '@/lib/auth/session';
import { resolveEducatorIdForUser } from '@/lib/auth/educator';

// Scenarios for the signed-in user: an educator's own, or the class a student is bound to.
// The owner comes from the session (users.educator_id) — it used to be named by the client,
// which let anyone dump any educator's full scenario configuration.
export async function POST() {
  try {
    const sessionUserId = await getSessionUserId();
    if (!sessionUserId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const educatorId = await resolveEducatorIdForUser(sessionUserId);
    if (!educatorId) {
      return NextResponse.json({ error: 'No class is associated with this account' }, { status: 403 });
    }

    // presetMessages is a json-mode column — drizzle returns it as a parsed array.
    const scenarios = await db.query.scenarios.findMany({
      where: eq(scenariosTable.userId, educatorId),
    });

    return NextResponse.json({ scenarios });
  } catch (error) {
    console.error('Error loading scenarios:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
