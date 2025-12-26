import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If user is not signed in and trying to access dashboard
  if (!session && req.nextUrl.pathname.startsWith('/dashboard') && !req.nextUrl.pathname.includes('/login')) {
    return NextResponse.redirect(new URL('/dashboard/login', req.url));
  }

  // If user is signed in and trying to access login page
  if (session && req.nextUrl.pathname.includes('/login')) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
