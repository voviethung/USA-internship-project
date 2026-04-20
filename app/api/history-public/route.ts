import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Public history endpoint (temporary): returns recent conversations for everyone.
 * NOTE: uses service role key, so keep response shape minimal.
 */
export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase server env is not configured.' },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('conversations')
      .select('id, user_id, transcript, translated_vi, reply_en, reply_vi, audio_duration, ai_provider, file_url, file_name, file_type, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    return NextResponse.json(
      { success: true, data: data ?? [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
