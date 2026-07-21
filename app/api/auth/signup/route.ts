import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, accessCodes, RESERVED_USERNAMES } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { createSession, setClassCookie } from '@/lib/auth/session';
import { buildAuthUser, findEducatorByUsername } from '@/lib/auth/educator';
import { educatorSignupSchema, studentSignupSchema } from '@/lib/validation/auth';
import { createDefaultScenarios } from '@/lib/default-scenarios';
import { DEFAULT_WELCOME_MARKDOWN } from '@/lib/welcome-content';

// Two disjoint sign-up paths, chosen by whether the request carries an `educator`:
//   • educator (root page `/`)          — requires ADMIN_PASSCODE; creates educator_id = NULL.
//   • student  (link `/<educator>`)     — creates educator_id = that educator; the username is
//                                         only reserved within that class.
// A request may never be both: the student path rejects a passcode outright, so no one can
// mint an educator account from a distribution link.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const isStudentSignup = typeof body?.educator === 'string' && body.educator.trim().length > 0;

    return isStudentSignup ? await signUpStudent(body) : await signUpEducator(body);
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 });
  }
}

async function signUpEducator(body: unknown) {
  const parsed = educatorSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid input' },
      { status: 400 }
    );
  }
  const { username, password, passcode } = parsed.data;

  if (passcode !== process.env.ADMIN_PASSCODE) {
    return NextResponse.json({ error: 'Invalid educator passcode' }, { status: 403 });
  }

  // An educator's username becomes their distribution-link path segment, so it must not
  // shadow a real route.
  if ((RESERVED_USERNAMES as readonly string[]).includes(username.toLowerCase())) {
    return NextResponse.json(
      { error: 'That username is reserved. Please choose another.' },
      { status: 409 }
    );
  }

  const pw = validatePassword(password);
  if (!pw.valid) {
    return NextResponse.json({ error: pw.error }, { status: 400 });
  }

  // Educator usernames are unique among educators only (students live in their own namespace).
  const existing = await db.query.users.findFirst({
    where: and(eq(users.username, username), isNull(users.educatorId)),
  });
  if (existing) {
    return NextResponse.json({ error: 'That username is already taken' }, { status: 409 });
  }

  const userId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    username,
    passwordHash: await hashPassword(password),
    userType: 'admin',
    educatorId: null,
    welcomeMarkdown: DEFAULT_WELCOME_MARKDOWN,
    createdAt: new Date(),
    lastLoginAt: new Date(),
  });

  await createDefaultScenarios(userId);
  await createSession(userId);

  const created = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return NextResponse.json({ user: await buildAuthUser(created!), isNewUser: true });
}

async function signUpStudent(body: unknown) {
  const parsed = studentSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid input' },
      { status: 400 }
    );
  }
  const { username, password, educator: educatorUsername, accessCode } = parsed.data;

  // The educator passcode has no meaning here; accepting it would let anyone create an
  // educator account through a class link.
  if (typeof (body as { passcode?: unknown }).passcode === 'string' && (body as { passcode: string }).passcode.length > 0) {
    return NextResponse.json(
      { error: 'Educators sign up on the home page, not through a class link.' },
      { status: 400 }
    );
  }

  const educator = await findEducatorByUsername(educatorUsername);
  if (!educator) {
    return NextResponse.json({ error: 'That class link is not valid' }, { status: 404 });
  }

  const code = (accessCode ?? '').trim();

  // Access codes stay single-use and are always checked against THIS educator, so a code
  // issued by another educator can never be redeemed here. When the educator has turned off
  // open enrollment, a valid code is the only way in.
  let redeemCodeId: string | null = null;
  if (code) {
    const found = await db.query.accessCodes.findFirst({
      where: and(
        eq(accessCodes.code, code),
        eq(accessCodes.educatorId, educator.id),
        isNull(accessCodes.usedByUserId)
      ),
      columns: { id: true },
    });
    if (!found) {
      return NextResponse.json(
        { error: 'That access code is invalid, already used, or belongs to a different class' },
        { status: 403 }
      );
    }
    redeemCodeId = found.id;
  } else if (!educator.openEnrollment) {
    return NextResponse.json(
      { error: 'This class requires an access code. Please use the invite link your educator sent you.' },
      { status: 403 }
    );
  }

  const pw = validatePassword(password);
  if (!pw.valid) {
    return NextResponse.json({ error: pw.error }, { status: 400 });
  }

  // Scoped to this educator: the same username may already exist in another class.
  const existing = await db.query.users.findFirst({
    where: and(eq(users.username, username), eq(users.educatorId, educator.id)),
  });
  if (existing) {
    return NextResponse.json(
      { error: 'That username is already taken in this class' },
      { status: 409 }
    );
  }

  const userId = crypto.randomUUID();
  try {
    await db.insert(users).values({
      id: userId,
      username,
      passwordHash: await hashPassword(password),
      userType: 'user',
      educatorId: educator.id,
      welcomeMarkdown: null,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    });
  } catch (error) {
    // Lost a race against a concurrent signup with the same name in this class.
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return NextResponse.json(
        { error: 'That username is already taken in this class' },
        { status: 409 }
      );
    }
    throw error;
  }

  // Claim the code atomically: `usedByUserId IS NULL` is part of the UPDATE, so of N
  // simultaneous signups sharing one code exactly one can win. (The earlier SELECT only
  // rejects codes that were already spent before this request started — without this guard,
  // concurrent requests all pass that check and every one of them gets an account.) The FK on
  // used_by_user_id means the user row must exist first, so a loser is rolled back here.
  if (redeemCodeId) {
    const claim = await db
      .update(accessCodes)
      .set({ usedByUserId: userId, usedAt: new Date() })
      .where(and(eq(accessCodes.id, redeemCodeId), isNull(accessCodes.usedByUserId)));

    if (claim.changes === 0) {
      await db.delete(users).where(eq(users.id, userId));
      return NextResponse.json(
        { error: 'That access code was just used by someone else. Please ask your educator for a new one.' },
        { status: 409 }
      );
    }
  }

  await createSession(userId);
  await setClassCookie(educator.username);

  const created = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return NextResponse.json({ user: await buildAuthUser(created!), isNewUser: true });
}
