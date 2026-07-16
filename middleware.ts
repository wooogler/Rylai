import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge-safe verification of the HMAC-signed session cookie. Must stay in sync
// with lib/auth/session.ts (same cookie name, same `${userId}.${hexHmac}` format).
const SESSION_COOKIE_NAME = 'rylai_session';

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
  const url = request.nextUrl.clone();
  url.pathname = '/';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/chat/:path*', '/admin/:path*', '/select-user/:path*', '/welcome'],
};
