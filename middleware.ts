import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge-safe verification of the HMAC-signed session cookie. Must stay in sync
// with lib/auth/session.ts (same cookie name, same `${userId}.${hexHmac}` format).
const SESSION_COOKIE_NAME = 'rylai_session';
// Set for students at login/signup (lib/auth/session.ts). Holds the educator's username so an
// expired student session can be bounced to their own login page instead of `/`, which is
// educator-only. It is a routing hint, never an authorization signal.
const CLASS_COOKIE_NAME = 'rylai_class';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return false;
  const userId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const secret = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId));
  return toHex(mac) === sig;
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await verifySession(token)) {
    return NextResponse.next();
  }
  // Not signed in. Students belong on their class page (`/<educator>`), which is the only
  // place they can log back in; everyone else goes to the educator login at `/`.
  const url = request.nextUrl.clone();
  const className = request.cookies.get(CLASS_COOKIE_NAME)?.value;
  url.search = '';
  url.pathname = className ? `/${encodeURIComponent(className)}` : '/';
  return NextResponse.redirect(url);
}

export const config = {
  // `/[educator]` is deliberately absent: it is the public student login/signup page.
  matcher: ['/chat/:path*', '/admin/:path*', '/welcome', '/complete'],
};
