import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const adminUser = await db.query.users.findFirst({
      where: and(
        eq(users.username, username),
        eq(users.userType, 'admin')
      ),
      columns: {
        id: true,
        commonSystemPrompt: true,
        feedbackPersona: true,
        feedbackInstruction: true
      }
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Admin user not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ adminUser });
  } catch (error) {
    console.error('Error loading admin info:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
