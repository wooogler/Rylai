import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

// Resolve an educator by username for the dedicated educator URL (Evaluation Plan §6,
// L96–97). Public: a learner may hit this before signing in. Returns only the fields the
// dedicated-URL flow needs (never password data).
export async function GET(request: NextRequest) {
  try {
    const username = new URL(request.url).searchParams.get('username');
    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 });
    }

    const educator = await db.query.users.findFirst({
      where: and(eq(users.username, username), eq(users.userType, 'admin')),
      columns: { id: true, username: true, age: true, welcomeMarkdown: true },
    });

    if (!educator) {
      return NextResponse.json({ educator: null }, { status: 404 });
    }

    return NextResponse.json({
      educator: {
        id: educator.id,
        username: educator.username,
        age: educator.age ?? null,
        hasWelcome: !!(educator.welcomeMarkdown && educator.welcomeMarkdown.trim()),
      },
    });
  } catch (error) {
    console.error('Error resolving educator:', error);
    return NextResponse.json({ error: 'Failed to resolve educator' }, { status: 500 });
  }
}
