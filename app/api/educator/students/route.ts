import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, accessCodes } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getSessionUserId } from '@/lib/auth/session';
import { buildProgressByUser, type ParticipantProgress } from '@/lib/progress/educator-progress';

// The signed-in educator's full student roster with per-scenario progress. This is the
// authoritative participant list: access codes only cover students who redeemed one, so
// anyone who joined through the plain class link would otherwise be invisible. Scoped
// strictly to the session educator — the roster is never addressable by id.

export interface StudentRow {
  id: string;
  username: string;
  createdAt: number;
  lastLoginAt: number | null;
  // The access code this student redeemed at signup, if any (null = joined via class link).
  accessCode: string | null;
  participantLabel: string | null;
  progress: ParticipantProgress[];
}

export async function GET() {
  try {
    const sessionUserId = await getSessionUserId();
    if (!sessionUserId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const educator = await db.query.users.findFirst({
      where: and(eq(users.id, sessionUserId), eq(users.userType, 'admin'), isNull(users.educatorId)),
      columns: { id: true },
    });
    if (!educator) {
      return NextResponse.json({ error: 'Educator account required' }, { status: 403 });
    }

    const students = await db.query.users.findMany({
      where: eq(users.educatorId, educator.id),
      columns: { id: true, username: true, createdAt: true, lastLoginAt: true },
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });

    const codeRows = await db.query.accessCodes.findMany({
      where: eq(accessCodes.educatorId, educator.id),
      columns: { code: true, participantLabel: true, usedByUserId: true },
    });
    const codeByUser = new Map(
      codeRows
        .filter((c) => !!c.usedByUserId)
        .map((c) => [c.usedByUserId!, { code: c.code, participantLabel: c.participantLabel }])
    );

    const progressByUser = await buildProgressByUser(
      educator.id,
      students.map((s) => s.id)
    );

    const rows: StudentRow[] = students.map((s) => {
      const code = codeByUser.get(s.id);
      return {
        id: s.id,
        username: s.username,
        createdAt: s.createdAt.getTime(),
        lastLoginAt: s.lastLoginAt ? s.lastLoginAt.getTime() : null,
        accessCode: code?.code ?? null,
        participantLabel: code?.participantLabel || null,
        progress: progressByUser.get(s.id) ?? [],
      };
    });

    return NextResponse.json({ students: rows });
  } catch (error) {
    console.error('Error listing students:', error);
    return NextResponse.json({ error: 'Failed to list students' }, { status: 500 });
  }
}
