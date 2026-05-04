import { createBrowserClient } from '@supabase/ssr';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Supabase client for browser (client components).
 * Uses the public anon key — respects RLS policies.
 */
export function createSupabaseBrowser() {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  return browserClient;
}
