import { cookies } from 'next/headers';
import crypto from 'crypto';

// httpOnly, HMAC-signed session cookie. The cookie value is `${userId}.${sig}`
// where sig = HMAC-SHA256(userId) hex. userIds are UUIDs (no dots), so splitting
// on the last '.' is unambiguous. The same hex signing scheme is re-implemented
// with Web Crypto in middleware.ts for edge verification — keep them in sync.

export const SESSION_COOKIE_NAME = 'rylai_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Which educator's class a student last signed in to, as a plain username. Not an
// authorization signal — it exists only so the edge middleware can bounce an expired
// student session to `/<educator>` (their login page) instead of `/`, which is now
// educator-only. It deliberately outlives the session cookie so an expiry still routes
// correctly, and is cleared on explicit logout.
export const CLASS_COOKIE_NAME = 'rylai_class';
const CLASS_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

function getSecret(): string {
  return process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';
}

function sign(value: string): string {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

export function makeSessionToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return null;
  const userId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(userId);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return userId;
}

export async function createSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, makeSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(CLASS_COOKIE_NAME);
}

// Remember the class a student just authenticated into (see CLASS_COOKIE_NAME).
export async function setClassCookie(educatorUsername: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CLASS_COOKIE_NAME, educatorUsername, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CLASS_MAX_AGE,
  });
}

export async function clearClassCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CLASS_COOKIE_NAME);
}
