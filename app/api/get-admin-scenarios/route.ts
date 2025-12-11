import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { scenarios as scenariosTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const { adminId } = await req.json();

    if (!adminId) {
      return NextResponse.json(
        { error: 'adminId is required' },
        { status: 400 }
      );
    }

    const scenarioData = await db.query.scenarios.findMany({
      where: eq(scenariosTable.userId, adminId),
      columns: {
        id: true
      }
    });

    return NextResponse.json({ scenarios: scenarioData });
  } catch (error) {
    console.error('Error loading scenarios:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
