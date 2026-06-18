import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { loginSchema } from '@/lib/validation/auth';

// Generic message — never reveal whether the username or the password was wrong.
const INVALID = 'Invalid username or password';

export async function POST(request: NextRequest) {
  try {
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { username, password } = parsed.data;

    const user = await db.query.users.findFirst({ where: eq(users.username, username) });
    if (!user) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await createSession(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        userType: user.userType,
        age: user.age,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
