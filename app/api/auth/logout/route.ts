import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

function clearProfileCacheCookies(response: NextResponse) {
  response.cookies.delete('_r');
  response.cookies.delete('_s');
  response.cookies.delete('_uid');
}

export async function POST() {
  const supabase = createSupabaseServer();
  await supabase.auth.signOut();

  const response = NextResponse.json({ success: true });
  clearProfileCacheCookies(response);

  return response;
}