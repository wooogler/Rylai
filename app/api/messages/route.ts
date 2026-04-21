import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { userMessages } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

// GET - Load messages for a scenario
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const scenarioId = searchParams.get('scenarioId');

    if (!userId || !scenarioId) {
      return NextResponse.json({ error: 'User ID and Scenario ID are required' }, { status: 400 });
    }

    const data = await db.query.userMessages.findMany({
      where: and(
        eq(userMessages.userId, userId),
        eq(userMessages.scenarioId, parseInt(scenarioId))
      ),
      orderBy: [asc(userMessages.timestamp)]
    });

    const messages = (data || []).map(row => ({
      id: row.messageId,
      text: row.text,
      sender: row.sender as "user" | "other",
      timestamp: new Date(row.timestamp),
      feedbackGenerated: false,
    }));

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error loading messages:', error);
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
  }
}

// POST - Save a message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, scenarioId, message } = body;

    if (!userId || !scenarioId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if message already exists
    const existingMessage = await db.query.userMessages.findFirst({
      where: and(
        eq(userMessages.userId, userId),
        eq(userMessages.scenarioId, scenarioId),
        eq(userMessages.messageId, message.id)
      )
    });

    if (existingMessage) {
      return NextResponse.json({ success: true, alreadyExists: true });
    }

    const timestamp = message.timestamp instanceof Date
      ? message.timestamp
      : new Date(message.timestamp);

    await db.insert(userMessages).values({
      id: crypto.randomUUID(),
      userId,
      scenarioId,
      messageId: message.id,
      text: message.text,
      sender: message.sender,
      timestamp,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving message:', error);
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }
}

// DELETE - Clear all messages for a scenario
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const scenarioId = searchParams.get('scenarioId');

    if (!userId || !scenarioId) {
      return NextResponse.json({ error: 'User ID and Scenario ID are required' }, { status: 400 });
    }

    await db.delete(userMessages).where(
      and(
        eq(userMessages.userId, userId),
        eq(userMessages.scenarioId, parseInt(scenarioId))
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing messages:', error);
    return NextResponse.json({ error: 'Failed to clear messages' }, { status: 500 });
  }
}
