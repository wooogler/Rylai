import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { accessCodes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

// Educator-issued participant access codes (Evaluation Plan §6, L101–102). Codes gate learner
// signup: a learner must present an unused code, which is then consumed.

function genCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

// GET ?educatorId= — list this educator's codes (newest first).
export async function GET(request: NextRequest) {
  try {
    const educatorId = new URL(request.url).searchParams.get('educatorId');
    if (!educatorId) {
      return NextResponse.json({ error: 'educatorId is required' }, { status: 400 });
    }
    const codes = await db.query.accessCodes.findMany({
      where: eq(accessCodes.educatorId, educatorId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    return NextResponse.json({ codes });
  } catch (error) {
    console.error('Error listing access codes:', error);
    return NextResponse.json({ error: 'Failed to list access codes' }, { status: 500 });
  }
}

// POST { educatorId, code?, participantLabel?, count? } — create one specific code, or
// generate `count` random ones. Returns the educator's full (refreshed) code list.
export async function POST(request: NextRequest) {
  try {
    const { educatorId, code, participantLabel, count } = await request.json();
    if (!educatorId) {
      return NextResponse.json({ error: 'educatorId is required' }, { status: 400 });
    }
    const label = typeof participantLabel === 'string' ? participantLabel.trim() : '';

    if (typeof code === 'string' && code.trim()) {
      const c = code.trim();
      const existing = await db.query.accessCodes.findFirst({ where: eq(accessCodes.code, c) });
      if (existing) {
        return NextResponse.json({ error: 'That code already exists' }, { status: 409 });
      }
      await db.insert(accessCodes).values({ code: c, educatorId, participantLabel: label });
    } else {
      const n = Math.min(Math.max(1, typeof count === 'number' ? count : 1), 50);
      for (let i = 0; i < n; i++) {
        let c = genCode();
        for (let attempt = 0; attempt < 5; attempt++) {
          const existing = await db.query.accessCodes.findFirst({ where: eq(accessCodes.code, c) });
          if (!existing) break;
          c = genCode();
        }
        await db.insert(accessCodes).values({ code: c, educatorId, participantLabel: label });
      }
    }

    const codes = await db.query.accessCodes.findMany({
      where: eq(accessCodes.educatorId, educatorId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    return NextResponse.json({ codes });
  } catch (error) {
    console.error('Error creating access codes:', error);
    return NextResponse.json({ error: 'Failed to create access codes' }, { status: 500 });
  }
}

// DELETE ?id=&educatorId= — remove a code (scoped to the educator).
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const educatorId = searchParams.get('educatorId');
    if (!id || !educatorId) {
      return NextResponse.json({ error: 'id and educatorId are required' }, { status: 400 });
    }
    await db.delete(accessCodes).where(and(eq(accessCodes.id, id), eq(accessCodes.educatorId, educatorId)));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting access code:', error);
    return NextResponse.json({ error: 'Failed to delete access code' }, { status: 500 });
  }
}
