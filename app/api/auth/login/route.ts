import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, setClassCookie, clearClassCookie } from '@/lib/auth/session';
import { buildAuthUser, findEducatorByUsername } from '@/lib/auth/educator';
import { loginSchema } from '@/lib/validation/auth';

// Generic message — never reveal whether the username or the password was wrong.
const INVALID = 'Invalid username or password';

// The lookup MUST be scoped, because usernames are only unique within a namespace:
//   • `educator` present (student login on `/<educator>`) → that educator's students only.
//   • `educator` absent  (educator login at `/`)          → educator rows only.
// An unscoped findFirst(username) would authenticate whichever row happened to match first —
// potentially another class's student, or the educator themselves.
export async function POST(request: NextRequest) {
  try {
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { username, password, educator: educatorUsername } = parsed.data;

    let user;
    let educatorForCookie: string | null = null;

    if (educatorUsername) {
      const educator = await findEducatorByUsername(educatorUsername);
      if (!educator) {
        return NextResponse.json({ error: INVALID }, { status: 401 });
      }
      user = await db.query.users.findFirst({
        where: and(eq(users.username, username), eq(users.educatorId, educator.id)),
      });
      educatorForCookie = educator.username;
    } else {
      user = await db.query.users.findFirst({
        where: and(
          eq(users.username, username),
          eq(users.userType, 'admin'),
          isNull(users.educatorId)
        ),
      });
    }

    if (!user) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await createSession(user.id);
    if (educatorForCookie) {
      await setClassCookie(educatorForCookie);
    } else {
      // An educator signing in on a browser previously used by a student: drop the stale
      // class hint so an expired session bounces to `/`, not to that student's class page.
      await clearClassCookie();
    }

    return NextResponse.json({ user: await buildAuthUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
