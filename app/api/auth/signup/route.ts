import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, accessCodes } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { signupSchema } from '@/lib/validation/auth';
import { createDefaultScenarios } from '@/lib/default-scenarios';
import { DEFAULT_WELCOME_MARKDOWN } from '@/lib/welcome-content';

export async function POST(request: NextRequest) {
  try {
    const parsed = signupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { username, password, passcode, accessCode } = parsed.data;

    // Determine role from the optional educator passcode.
    let userType: 'admin' | 'user' = 'user';
    if (passcode && passcode.length > 0) {
      if (passcode === process.env.ADMIN_PASSCODE) {
        userType = 'admin';
      } else {
        return NextResponse.json({ error: 'Invalid educator passcode' }, { status: 403 });
      }
    }

    // Learners must present a valid, unused participant access code (§6, L101–102). Look it
    // up now; it is consumed (marked used) only after the account is created below.
    let redeemCode: { id: string } | null = null;
    if (userType === 'user') {
      const code = (accessCode ?? '').trim();
      if (!code) {
        return NextResponse.json({ error: 'An access code is required to sign up' }, { status: 400 });
      }
      const found = await db.query.accessCodes.findFirst({
        where: and(eq(accessCodes.code, code), isNull(accessCodes.usedByUserId)),
        columns: { id: true },
      });
      if (!found) {
        return NextResponse.json({ error: 'Invalid or already-used access code' }, { status: 403 });
      }
      redeemCode = found;
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
      // Seed the default Welcome-screen content for new educators (learners have none).
      welcomeMarkdown: userType === 'admin' ? DEFAULT_WELCOME_MARKDOWN : null,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    });

    if (userType === 'admin') {
      await createDefaultScenarios(userId);
    }

    // Consume the access code now that the learner account exists.
    if (redeemCode) {
      await db.update(accessCodes)
        .set({ usedByUserId: userId, usedAt: new Date() })
        .where(eq(accessCodes.id, redeemCode.id));
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
