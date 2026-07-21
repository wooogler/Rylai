import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, scenarios as scenariosTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionUserId, destroySession } from '@/lib/auth/session';

// Self-service account deletion for the signed-in user. The target is taken from the session
// — never from the request body, which previously allowed deleting any account by id.
//
// For an educator this is destructive beyond their own row: users.educator_id cascades, so
// every student in their class (and each student's messages, feedback and progress) goes with
// it. The admin page confirms this with the user before calling.
export async function POST() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    // Delete all scenarios owned by this user (cascades handle related data)
    await db.delete(scenariosTable).where(eq(scenariosTable.userId, userId));

    // Delete the user (cascades to their students, if they are an educator)
    await db.delete(users).where(eq(users.id, userId));

    await destroySession();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
