import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { accessCodes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { findEducatorByUsername } from '@/lib/auth/educator';

// Public check for the invite-link flow: given a code and the class it was opened in
// (`/<educator>?code=…`), report whether it is usable there, so the sign-up form can show
// "you're joining X's class" before any account exists.
//
// It answers only about the code presented, scoped to the educator in the URL — a code
// belonging to another class reads as invalid here, and no educator identity is returned.
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const code = params.get('code')?.trim();
    const educatorUsername = params.get('educator')?.trim();
    if (!code || !educatorUsername) {
      return NextResponse.json({ error: 'code and educator are required' }, { status: 400 });
    }

    const educator = await findEducatorByUsername(educatorUsername);
    if (!educator) {
      return NextResponse.json({ status: 'invalid' });
    }

    const row = await db.query.accessCodes.findFirst({
      where: and(eq(accessCodes.code, code), eq(accessCodes.educatorId, educator.id)),
      columns: { usedByUserId: true },
    });

    if (!row) return NextResponse.json({ status: 'invalid' });
    return NextResponse.json({ status: row.usedByUserId ? 'used' : 'valid' });
  } catch (error) {
    console.error('Error looking up access code:', error);
    return NextResponse.json({ error: 'Failed to look up access code' }, { status: 500 });
  }
}
