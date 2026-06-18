import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { scenarios } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// POST - Add new scenario
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, slug, name, predatorName, handle, presetMessages, description, stage, autoStage } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    await db.insert(scenarios)
      .values({
        userId,
        slug,
        name,
        predatorName,
        handle,
        presetMessages: presetMessages ?? [],
        description,
        stage,
        autoStage: autoStage ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    // Query the inserted scenario (scoped to this educator + slug, latest first)
    const newScenario = await db.query.scenarios.findFirst({
      where: and(eq(scenarios.userId, userId), eq(scenarios.slug, slug)),
      orderBy: (scenarios, { desc }) => [desc(scenarios.id)]
    });

    if (!newScenario) {
      throw new Error('Failed to create scenario');
    }

    // presetMessages is a json-mode column — already returned as a parsed array.
    return NextResponse.json(newScenario);
  } catch (error) {
    console.error('Error adding scenario:', error);
    return NextResponse.json({ error: 'Failed to add scenario' }, { status: 500 });
  }
}

// PATCH - Update scenario
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, userId, updates } = body;

    if (!id || !userId) {
      return NextResponse.json({ error: 'Scenario ID and User ID are required' }, { status: 400 });
    }

    const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };

    if (updates.slug !== undefined) dbUpdates.slug = updates.slug;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.predatorName !== undefined) dbUpdates.predatorName = updates.predatorName;
    if (updates.handle !== undefined) dbUpdates.handle = updates.handle;
    if (updates.presetMessages !== undefined) {
      dbUpdates.presetMessages = updates.presetMessages;
    }
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.stage !== undefined) dbUpdates.stage = updates.stage;
    if (updates.autoStage !== undefined) dbUpdates.autoStage = updates.autoStage;

    await db.update(scenarios)
      .set(dbUpdates)
      .where(eq(scenarios.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating scenario:', error);
    return NextResponse.json({ error: 'Failed to update scenario' }, { status: 500 });
  }
}

// DELETE - Delete scenario
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');

    if (!id || !userId) {
      return NextResponse.json({ error: 'Scenario ID and User ID are required' }, { status: 400 });
    }

    await db.delete(scenarios).where(eq(scenarios.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting scenario:', error);
    return NextResponse.json({ error: 'Failed to delete scenario' }, { status: 500 });
  }
}
