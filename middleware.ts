import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { canAccess } from '@/lib/roles';
import type { UserRole } from '@/lib/types';

const PUBLIC_ROUTES = ['/login', '/auth'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

/**
 * Auth middleware — refreshes Supabase session on every navigation,
 * redirects unauthenticated users to /login,
 * and enforces role-based route access.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          // Forward cookies to the browser
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session (important — keeps tokens alive)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const publicRoute = isPublicRoute(pathname);

  if (!user && !publicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (!user) {
    return supabaseResponse;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, approval_status')
    .eq('id', user.id)
    .single();

  const role = (profile?.role as UserRole) || 'student';
  const approvalStatus = profile?.approval_status || 'pending';

  if (approvalStatus !== 'approved' && !pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set(approvalStatus, '1');
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/login') && approvalStatus === 'approved') {
    const url = request.nextUrl.clone();
    url.pathname = role === 'student' ? '/resources' : '/';
    return NextResponse.redirect(url);
  }

  if (!publicRoute && !canAccess(role, pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = role === 'student' ? '/resources' : '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all routes EXCEPT:
     * - _next/static, _next/image (Next.js internals)
     * - favicon, icons, manifest, sw.js (PWA assets)
     * - API routes (they handle their own auth)
     * - Static files (images, fonts, etc.)
     */
    '/((?!_next/static|_next/image|api|favicon\\.ico|icons|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
