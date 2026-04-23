import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createSupabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

interface SaveTranslationPayload {
  sessionId?: string;
  transcript?: string;
  source_lang?: 'en' | 'vi';
  target_lang?: 'en' | 'vi';
  translated_vi?: string;
  translated_en?: string;
  reply_en?: string;
  reply_vi?: string;
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'anonymous';

    const isLocalDev =
      process.env.NODE_ENV !== 'production' &&
      (ip === 'anonymous' || ip === '127.0.0.1' || ip === '::1');

    if (!isLocalDev && !checkRateLimit(ip, 80, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again in 1 minute.' },
        { status: 429 },
      );
    }

    const payload = (await req.json()) as SaveTranslationPayload;
    const transcript = payload.transcript?.trim() ?? '';

    if (!transcript) {
      return NextResponse.json(
        { success: false, error: 'Missing transcript.' },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServer();
    const user = (await supabase.auth.getUser()).data.user;

    // Idempotency-ish guard:
    // if an identical transcript from same user scope was saved recently,
    // treat as success and return existing id to avoid duplicate rows on retries.
    const cutoffIso = new Date(Date.now() - 5 * 60_000).toISOString();
    let duplicateQuery = supabase
      .from('translations')
      .select('id, created_at')
      .eq('transcript', transcript)
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(1);

    duplicateQuery = user
      ? duplicateQuery.eq('user_id', user.id)
      : duplicateQuery.is('user_id', null);

    const duplicateRes = await duplicateQuery;
    if (duplicateRes.data && duplicateRes.data.length > 0) {
      return NextResponse.json({
        success: true,
        data: { id: duplicateRes.data[0].id, deduplicated: true },
      });
    }

    const { data, error } = await supabase
      .from('translations')
      .insert({
        user_id: user?.id ?? null,
        transcript,
        source_lang: payload.source_lang ?? null,
        target_lang: payload.target_lang ?? null,
        translated_vi: payload.translated_vi ?? null,
        translated_en: payload.translated_en ?? null,
        reply_en: payload.reply_en ?? null,
        reply_vi: payload.reply_vi ?? null,
        ai_provider: 'groq',
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: { id: data.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
