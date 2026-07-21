import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionUserId } from '@/lib/auth/session';
import { buildAuthUser } from '@/lib/auth/educator';

// Source of truth for client auth state. Returns { user: null } when not logged in.
// For a student the payload also carries their bound educator's context (id, username, age,
// welcome flag, stage policy) — the client derives its "which class am I in" state from here
// rather than from persisted local storage, which a learner could point anywhere.
export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ user: null });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ user: await buildAuthUser(user) });
  } catch (error) {
    console.error('Auth me error:', error);
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
