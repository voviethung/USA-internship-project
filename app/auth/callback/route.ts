import { createSupabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

/**
 * Auth callback handler — exchanges the code for a session
 * after magic-link / OAuth redirect.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error('[auth/callback] Error exchanging code:', error.message);
  }

  // Redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
