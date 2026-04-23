import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { canAccess } from '@/lib/roles';
import type { UserRole } from '@/lib/types';

const PUBLIC_ROUTES = ['/login', '/auth'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

/** Helper: redirect while preserving refreshed Supabase session cookies */
function redirectWithCookies(url: URL, baseResponse: NextResponse): NextResponse {
  const res = NextResponse.redirect(url);
  baseResponse.cookies.getAll().forEach((cookie) => res.cookies.set(cookie));
  return res;
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
    return redirectWithCookies(url, supabaseResponse);
  }

  if (!user) {
    return supabaseResponse;
  }

  // Try to read cached role/status from cookie (5-min TTL) to avoid DB call on every request
  const cachedRole = request.cookies.get('_r')?.value as UserRole | undefined;
  const cachedStatus = request.cookies.get('_s')?.value;

  let role: UserRole;
  let approvalStatus: string;

  if (cachedRole && cachedStatus) {
    role = cachedRole;
    approvalStatus = cachedStatus;
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, approval_status')
      .eq('id', user.id)
      .single();

    role = (profile?.role as UserRole) || 'student';
    approvalStatus = profile?.approval_status || 'pending';

    // Cache for 5 minutes
    supabaseResponse.cookies.set('_r', role, { maxAge: 300, path: '/' });
    supabaseResponse.cookies.set('_s', approvalStatus, { maxAge: 300, path: '/' });
  }

  if (approvalStatus !== 'approved' && !pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set(approvalStatus, '1');
    return redirectWithCookies(url, supabaseResponse);
  }

  if (pathname.startsWith('/login') && approvalStatus === 'approved') {
    const url = request.nextUrl.clone();
    url.pathname = role === 'student' ? '/resources' : '/';
    return redirectWithCookies(url, supabaseResponse);
  }

  if (!publicRoute && !canAccess(role, pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = role === 'student' ? '/resources' : '/';
    return redirectWithCookies(url, supabaseResponse);
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
