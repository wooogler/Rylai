import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { accessCodes, users } from '@/lib/db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getSessionUserId } from '@/lib/auth/session';
import { buildProgressByUser, type ParticipantProgress } from '@/lib/progress/educator-progress';

// Educator-issued participant access codes (Evaluation Plan §6, L101–102). A code binds one
// participant to this educator's class and is consumed at signup. Codes are optional unless
// the educator turns off open enrollment — the plain class link `/<educator>` works too, so
// the full roster lives in /api/educator/students, not here.
//
// Every verb acts on the session educator's own codes; the educator id is never taken from
// the request (it used to be, which exposed any other educator's codes and participants).

function genCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

// Resolve the acting educator, or null when the caller isn't a signed-in educator.
async function requireEducatorId(): Promise<string | null> {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return null;
  const educator = await db.query.users.findFirst({
    where: and(eq(users.id, sessionUserId), eq(users.userType, 'admin'), isNull(users.educatorId)),
    columns: { id: true },
  });
  return educator?.id ?? null;
}

const FORBIDDEN = NextResponse.json({ error: 'Educator account required' }, { status: 403 });

// GET — this educator's codes (newest first), with the redeeming participant's username and
// per-scenario progress for used codes.
export async function GET() {
  try {
    const educatorId = await requireEducatorId();
    if (!educatorId) return FORBIDDEN;

    const codes = await db.query.accessCodes.findMany({
      where: eq(accessCodes.educatorId, educatorId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    const usedUserIds = [...new Set(codes.map((c) => c.usedByUserId).filter((v): v is string => !!v))];

    const userRows = usedUserIds.length
      ? await db.query.users.findMany({
          where: inArray(users.id, usedUserIds),
          columns: { id: true, username: true },
        })
      : [];
    const usernameById = new Map(userRows.map((u) => [u.id, u.username]));

    const progressByUser = await buildProgressByUser(educatorId, usedUserIds);

    const enriched = codes.map((c) => ({
      ...c,
      usedByUsername: c.usedByUserId ? (usernameById.get(c.usedByUserId) ?? null) : null,
      progress: c.usedByUserId
        ? ((progressByUser.get(c.usedByUserId) ?? []) as ParticipantProgress[])
        : null,
    }));

    return NextResponse.json({ codes: enriched });
  } catch (error) {
    console.error('Error listing access codes:', error);
    return NextResponse.json({ error: 'Failed to list access codes' }, { status: 500 });
  }
}

// POST { code?, participantLabel?, count? } — create one specific code, or generate `count`
// random ones, always owned by the session educator.
export async function POST(request: NextRequest) {
  try {
    const educatorId = await requireEducatorId();
    if (!educatorId) return FORBIDDEN;

    const { code, participantLabel, count } = await request.json();
    const label = typeof participantLabel === 'string' ? participantLabel.trim() : '';

    if (typeof code === 'string' && code.trim()) {
      const c = code.trim();
      // Codes are globally unique (one lookup at signup), so a clash with another educator's
      // code is possible and must be reported.
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

    // The client re-fetches the (enriched) list via GET after a create.
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating access codes:', error);
    return NextResponse.json({ error: 'Failed to create access codes' }, { status: 500 });
  }
}

// DELETE ?id= — remove one of the session educator's codes.
export async function DELETE(request: NextRequest) {
  try {
    const educatorId = await requireEducatorId();
    if (!educatorId) return FORBIDDEN;

    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    await db.delete(accessCodes).where(and(eq(accessCodes.id, id), eq(accessCodes.educatorId, educatorId)));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting access code:', error);
    return NextResponse.json({ error: 'Failed to delete access code' }, { status: 500 });
  }
}
