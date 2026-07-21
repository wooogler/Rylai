import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionUserId } from '@/lib/auth/session';

// Source of truth for client auth state. Returns { user: null } when not logged in.
export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ user: null });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        username: true,
        userType: true,
        age: true,
        feedbackConfig: true,
        classificationConfig: true,
        welcomeMarkdown: true,
        closingMarkdown: true,
        stageEscalation: true,
      },
    });

    return NextResponse.json({ user: user ?? null });
  } catch (error) {
    console.error('Auth me error:', error);
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
