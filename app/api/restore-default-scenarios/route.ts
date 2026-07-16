import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { scenarios } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createDefaultScenarios } from '@/lib/default-scenarios';

// POST - Replace an educator's scenarios with the study defaults (Evaluation Plan §6).
// Existing scenarios are deleted (cascading their messages/feedback/progress) and the
// two default scenarios are re-seeded. Destructive — the admin UI confirms first.
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    await db.delete(scenarios).where(eq(scenarios.userId, userId));
    await createDefaultScenarios(userId);

    const fresh = await db.query.scenarios.findMany({
      where: eq(scenarios.userId, userId),
      orderBy: (scenarios, { asc }) => [asc(scenarios.id)],
    });

    return NextResponse.json({ scenarios: fresh });
  } catch (error) {
    console.error('Error restoring default scenarios:', error);
    return NextResponse.json({ error: 'Failed to restore default scenarios' }, { status: 500 });
  }
}
