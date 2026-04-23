import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createSupabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

type Lang = 'en' | 'vi';

function inferTargetLanguage(source: Lang): Lang {
  return source === 'en' ? 'vi' : 'en';
}

function getTranslateBaseUrl() {
  return process.env.SELF_HOSTED_TRANSLATE_URL || process.env.SELF_HOSTED_STT_URL || '';
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

    if (!isLocalDev && !checkRateLimit(ip, 60, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again in 1 minute.' },
        { status: 429 },
      );
    }

    const body = await req.json();
    const currentText = (body?.text ?? '').toString().trim();
    const previousTranscript = (body?.previousTranscript ?? '').toString().trim();
    const previousSourceLang = (body?.previousSourceLang === 'vi' ? 'vi' : 'en') as Lang;
    const previousTranslatedVi = (body?.previousTranslatedVi ?? '').toString();
    const previousTranslatedEn = (body?.previousTranslatedEn ?? '').toString();
    const language = (body?.language === 'vi' ? 'vi' : 'en') as Lang;
    const sessionEnded = body?.sessionEnded === true;
    const sessionId = body?.sessionId?.toString() ?? null;

    if (!currentText && !sessionEnded) {
      return NextResponse.json({ success: true, no_speech: true, data: null, session_id: sessionId });
    }

    const transcript = [previousTranscript, currentText].filter(Boolean).join(' ').trim();
    if (!transcript) {
      return NextResponse.json({
        success: true,
        no_speech: true,
        data: null,
        session_id: sessionId,
        is_session_end: sessionEnded,
      });
    }

    const hasNewChunk = currentText.length > 0;
    const sourceLang = hasNewChunk ? language : previousSourceLang;
    const targetLang = inferTargetLanguage(sourceLang);

    let translatedChunk = '';
    if (hasNewChunk) {
      const baseUrl = getTranslateBaseUrl();
      if (!baseUrl) {
        throw new Error('SELF_HOSTED_STT_URL (or SELF_HOSTED_TRANSLATE_URL) is missing.');
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      const translateKey = process.env.SELF_HOSTED_TRANSLATE_KEY || process.env.SELF_HOSTED_STT_KEY;
      if (translateKey) {
        headers['x-translate-key'] = translateKey;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: currentText,
          source_lang: sourceLang,
          target_lang: targetLang,
        }),
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const msg = await response.text();
        throw new Error(`Self-hosted translate failed (${response.status}): ${msg}`);
      }

      const payload = (await response.json()) as { translated_text?: string };
      translatedChunk = (payload.translated_text ?? '').trim();
    }

    const translated_vi =
      sourceLang === 'en'
        ? [previousTranslatedVi.trim(), translatedChunk].filter(Boolean).join(' ').trim()
        : '';
    const translated_en =
      sourceLang === 'vi'
        ? [previousTranslatedEn.trim(), translatedChunk].filter(Boolean).join(' ').trim()
        : '';

    if (sessionEnded) {
      const supabase = createSupabaseServer();
      void (async () => {
        try {
          const user = (await supabase.auth.getUser()).data.user;

          if (user) {
            const { error } = await supabase.from('conversations').insert({
              user_id: user.id,
              transcript,
              translated_vi,
              reply_en: '',
              reply_vi: '',
              ai_provider: 'self-hosted',
            });
            if (error) {
              console.error('[process-text] Background save error:', error.message);
            }
          }

          const { error } = await supabase.from('translations').insert({
            user_id: user?.id ?? null,
            transcript,
            source_lang: sourceLang,
            target_lang: targetLang,
            translated_vi,
            translated_en,
            reply_en: '',
            reply_vi: '',
            ai_provider: 'self-hosted',
          });
          if (error) {
            console.error('[process-text] Background save translations error:', error.message);
          }
        } catch (saveErr) {
          console.error('[process-text] Background save translations exception:', saveErr);
        }
      })();
    }

    return NextResponse.json({
      success: true,
      data: {
        transcript,
        source_lang: sourceLang,
        target_lang: targetLang,
        translated_vi,
        translated_en,
        reply_en: '',
        reply_vi: '',
        is_final: hasNewChunk,
        is_session_end: sessionEnded,
        conversation_id: null,
        session_id: sessionId,
      },
    });
  } catch (err) {
    console.error('[process-text] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
