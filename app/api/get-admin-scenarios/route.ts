import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { scenarios as scenariosTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const { adminId, adminUserId } = await req.json();
    const userId = adminId || adminUserId;

    if (!userId) {
      return NextResponse.json(
        { error: 'adminId or adminUserId is required' },
        { status: 400 }
      );
    }

    // presetMessages is a json-mode column — drizzle returns it as a parsed array.
    const scenarios = await db.query.scenarios.findMany({
      where: eq(scenariosTable.userId, userId)
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
