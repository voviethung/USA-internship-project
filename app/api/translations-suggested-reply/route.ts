import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAIProvider } from '@/lib/ai-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const translationId = body?.translationId as string | undefined;

    if (!translationId) {
      return NextResponse.json(
        { success: false, error: 'translationId is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

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

    const { data: row, error: getErr } = await supabase
      .from('translations')
      .select('id, transcript')
      .eq('id', translationId)
      .single();

    if (getErr || !row) {
      return NextResponse.json(
        { success: false, error: getErr?.message ?? 'Translation session not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const provider = getAIProvider();
    const aiResult = await provider.process(row.transcript, true, true);

    const { error: updateErr } = await supabase
      .from('translations')
      .update({
        reply_en: aiResult.reply_en,
        reply_vi: aiResult.reply_vi,
      })
      .eq('id', translationId);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: translationId,
          reply_en: aiResult.reply_en,
          reply_vi: aiResult.reply_vi,
        },
      },
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
