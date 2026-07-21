import { NextRequest, NextResponse } from 'next/server';
import { findEducatorByUsername, toEducatorContext } from '@/lib/auth/educator';

// Resolve an educator by username for their distribution link `/<educatorUsername>`.
// Deliberately public: this is what renders the student login / sign-up page before any
// account exists. It returns only what that page needs — never password data, and never
// anything about the educator's students.
export async function GET(request: NextRequest) {
  try {
    const username = new URL(request.url).searchParams.get('username');
    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 });
    }

    const educator = await findEducatorByUsername(username.trim());
    if (!educator) {
      return NextResponse.json({ educator: null }, { status: 404 });
    }

    const { id, username: name, age, hasWelcome, openEnrollment } = toEducatorContext(educator);
    // `stageEscalation` is intentionally omitted here — that is class configuration, handed
    // out only to authenticated members via /api/auth/me.
    return NextResponse.json({ educator: { id, username: name, age, hasWelcome, openEnrollment } });
  } catch (error) {
    console.error('Error resolving educator:', error);
    return NextResponse.json({ error: 'Failed to resolve educator' }, { status: 500 });
  }
}
