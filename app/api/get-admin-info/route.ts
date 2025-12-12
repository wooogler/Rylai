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

// PATCH - Update admin prompts
export async function PATCH(req: NextRequest) {
  try {
    const { userId, commonSystemPrompt, feedbackPersona, feedbackInstruction } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const updates: Record<string, string> = {};
    if (commonSystemPrompt !== undefined) updates.commonSystemPrompt = commonSystemPrompt;
    if (feedbackPersona !== undefined) updates.feedbackPersona = feedbackPersona;
    if (feedbackInstruction !== undefined) updates.feedbackInstruction = feedbackInstruction;

    await db.update(users)
      .set(updates)
      .where(eq(users.id, userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating admin info:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
