import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, scenarios as scenariosTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Delete all scenarios for this user (cascades will handle related data)
    await db.delete(scenariosTable).where(eq(scenariosTable.userId, userId));

    // Delete the user
    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
