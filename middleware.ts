import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check if the request is for a chat page
  if (request.nextUrl.pathname.startsWith('/chat')) {
    const authCookie = request.cookies.get('auth');

    // If no auth cookie or invalid, redirect to home
    if (!authCookie || authCookie.value !== 'vtcg-authenticated') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

// Configure which paths the middleware should run on
export const config = {
  matcher: '/chat/:path*',
};