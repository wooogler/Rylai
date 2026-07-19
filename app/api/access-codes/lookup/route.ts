import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { accessCodes, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Public lookup for the invite-link flow: given an access code, report whether it exists /
// has been used, and which educator it belongs to — so the signup form can pre-apply the
// educator and code ("joining <educator>'s class") before an account exists. Only the
// educator's username is exposed, and only to someone who already holds the exact code.
export async function GET(request: NextRequest) {
  try {
    const code = new URL(request.url).searchParams.get('code')?.trim();
    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    const row = await db.query.accessCodes.findFirst({
      where: eq(accessCodes.code, code),
      columns: { educatorId: true, participantLabel: true, usedByUserId: true },
    });

    if (!row) {
      return NextResponse.json({ found: false, used: false, educatorUsername: null, participantLabel: null });
    }

    const educator = await db.query.users.findFirst({
      where: eq(users.id, row.educatorId),
      columns: { username: true },
    });

    return NextResponse.json({
      found: true,
      used: !!row.usedByUserId,
      educatorUsername: educator?.username ?? null,
      participantLabel: row.participantLabel || null,
    });
  } catch (error) {
    console.error('Error looking up access code:', error);
    return NextResponse.json({ error: 'Failed to look up access code' }, { status: 500 });
  }
}
