import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Admin/mentor-only routes */
const ADMIN_ROUTES = ['/dashboard', '/mentors'];
const ADMIN_MENTOR_ROUTES = ['/students'];

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

  // AUTH TEMPORARILY DISABLED — allow all routes without login
  // Public routes that don't require auth
  // const isPublicRoute =
  //   pathname.startsWith('/login') || pathname.startsWith('/auth');

  // If not authenticated and trying to access protected route → redirect to login
  // if (!user && !isPublicRoute) {
  //   const url = request.nextUrl.clone();
  //   url.pathname = '/login';
  //   return NextResponse.redirect(url);
  // }

  // AUTH TEMPORARILY DISABLED — skip login redirect and role checks
  // If authenticated and on login page → redirect to home
  // if (user && pathname === '/login') {
  //   const url = request.nextUrl.clone();
  //   url.pathname = '/';
  //   return NextResponse.redirect(url);
  // }

  // Role-based route protection for authenticated users
  if (user) {
    const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
    const isAdminMentorRoute = ADMIN_MENTOR_ROUTES.some((r) => pathname.startsWith(r));

    if (isAdminRoute || isAdminMentorRoute) {
      // Fetch user role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const role = profile?.role || 'student';

      if (isAdminRoute && role !== 'admin' && role !== 'mentor') {
        // Only admin and mentor can access dashboard; only admin can access /mentors
        if (pathname.startsWith('/mentors') && role !== 'admin') {
          const url = request.nextUrl.clone();
          url.pathname = '/';
          return NextResponse.redirect(url);
        }
        if (pathname.startsWith('/dashboard') && role === 'student') {
          const url = request.nextUrl.clone();
          url.pathname = '/';
          return NextResponse.redirect(url);
        }
      }

      if (isAdminMentorRoute && role === 'student') {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
    }
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
