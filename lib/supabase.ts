import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for browser (client components).
 * Uses the public anon key — respects RLS policies.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
