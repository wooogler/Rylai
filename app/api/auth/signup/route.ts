import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { signupSchema } from '@/lib/validation/auth';
import { createDefaultScenarios } from '@/lib/default-scenarios';

export async function POST(request: NextRequest) {
  try {
    const parsed = signupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { username, password, passcode } = parsed.data;

    // Determine role from the optional educator passcode.
    let userType: 'admin' | 'user' = 'user';
    if (passcode && passcode.length > 0) {
      if (passcode === process.env.ADMIN_PASSCODE) {
        userType = 'admin';
      } else {
        return NextResponse.json({ error: 'Invalid educator passcode' }, { status: 403 });
      }
    }

    const pw = validatePassword(password);
    if (!pw.valid) {
      return NextResponse.json({ error: pw.error }, { status: 400 });
    }

    const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
    if (existing) {
      return NextResponse.json(
        { error: 'That username is already taken' },
        { status: 409 }
      );
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({
      id: userId,
      username,
      passwordHash,
      userType,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    });

    if (userType === 'admin') {
      await createDefaultScenarios(userId);
    }

    await createSession(userId);

    return NextResponse.json({
      user: { id: userId, username, userType },
      isNewUser: true,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 });
  }
}
