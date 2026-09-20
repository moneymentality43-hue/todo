// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from './lib/auth';

const protectedRoutes = ['/', '/progress']; // Add any other private routes here
const publicRoutes = ['/login'];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.includes(path);
  const isPublicRoute = publicRoutes.includes(path);

  const cookie = req.cookies.get('gof_session')?.value;
  const session = await decrypt(cookie || '');

  // 1. Not logged in + trying to access app = Kick to login
  if (isProtectedRoute && !session?.userId) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  // 2. Already logged in + trying to view login page = Send to app
  if (isPublicRoute && session?.userId) {
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }

  return NextResponse.next();
}

// Ensure middleware only runs on routes, not static files/images/api
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|sounds|favicon.ico).*)'],
};
