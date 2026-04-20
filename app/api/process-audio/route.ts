import { NextRequest, NextResponse } from 'next/server';
import { getAIProvider } from '@/lib/ai-provider';
import { checkRateLimit } from '@/lib/rate-limit';
import { createSupabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs'; // need Node for SDK file handling

export async function POST(req: NextRequest) {
  try {
    // ── Rate limit ──────────────────────────────────────
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'anonymous';

    const isLocalDev =
      process.env.NODE_ENV !== 'production' &&
      (ip === 'anonymous' || ip === '127.0.0.1' || ip === '::1');

    if (!isLocalDev && !checkRateLimit(ip, 40, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again in 1 minute.' },
        { status: 429 },
      );
    }

    // ── Parse form data ─────────────────────────────────
    const formData = await req.formData();
    const file = formData.get('file');
    const previousTranscript = formData.get('previousTranscript')?.toString() ?? '';
    const sessionId = formData.get('sessionId')?.toString() ?? null;
    const segmentEnded = formData.get('segmentEnded') === 'true';
    const sessionEnded = formData.get('sessionEnded') === 'true';
    const isCumulativeAudio = formData.get('isCumulativeAudio') === 'true';
    const language = (formData.get('language')?.toString() as 'en' | 'vi' | undefined) ?? 'en';
    const previousSourceLang =
      formData.get('previousSourceLang')?.toString() === 'vi' ? 'vi' : 'en';
    const previousTargetLang = previousSourceLang === 'en' ? 'vi' : 'en';
    const previousTranslatedVi = formData.get('previousTranslatedVi')?.toString() ?? '';
    const previousTranslatedEn = formData.get('previousTranslatedEn')?.toString() ?? '';

    if ((!file || !(file instanceof File)) && !sessionEnded) {
      return NextResponse.json(
        { success: false, error: 'No audio file provided.' },
        { status: 400 },
      );
    }

    if (file && file instanceof File) {
      if (file.size > 25 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: 'File too large. Maximum 25 MB.' },
          { status: 400 },
        );
      }
    }

    // ── AI Processing ───────────────────────────────────
    const provider = getAIProvider();

    // Step 1: Speech-to-text (+ Argos translation if self-hosted STT)
    let transcript = '';
    let segmentTranscript = '';
    let argosTranslation: string | null = null;
    let argosSourceLang: 'en' | 'vi' | null = null;
    if (file && file instanceof File) {
      if (file.size === 0) {
        return NextResponse.json(
          { success: false, error: 'Audio file is empty. Please record some audio.' },
          { status: 400 },
        );
      }
      
      const sttResult = await provider.speechToText(file, language);
      const currentChunkTranscript = (sttResult.text ?? '').trim();
      segmentTranscript = currentChunkTranscript;
      argosTranslation = sttResult.translation;
      argosSourceLang = sttResult.source_lang;
      const cleanedTranscript = currentChunkTranscript.replace(
        /[\s.,!?;:'"“”‘’`~\-_=+()\[\]{}<>/\\|@#$%^&*…]+/g,
        '',
      );

      // No speech (or STT produced empty output): do not fail the request.
      // Let UI continue recording and wait for the next meaningful segment.
      if (cleanedTranscript.length === 0) {
        if (sessionEnded && previousTranscript.trim().length > 0) {
          transcript = previousTranscript.trim();
        } else {
          return NextResponse.json({
            success: true,
            no_speech: true,
            data: null,
            session_id: sessionId,
          });
        }
      } else {
      transcript = isCumulativeAudio
        ? currentChunkTranscript
        : [previousTranscript?.trim(), currentChunkTranscript]
            .filter(Boolean)
            .join(' ');
      }
    } else if (sessionEnded && previousTranscript.trim().length > 0) {
      transcript = previousTranscript.trim();
    }

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'No transcript available to process.' },
        { status: 422 },
      );
    }

    // Step 2: Segment translation strategy
    // Priority: Argos (fast, local, no quota) → LLM (fallback)
    // - sessionEnded without new audio: skip translation, reuse previous
    const hasAudioChunk = Boolean(file && file instanceof File);

    const result = hasAudioChunk
      ? (() => {
          // If self-hosted STT returned Argos translation → use it directly, no LLM call
          if (argosTranslation) {
            const srcLang = argosSourceLang ?? language;
            const tgtLang = srcLang === 'en' ? 'vi' : 'en';
            console.log(`[process-audio] Using Argos translation (no LLM): "${argosTranslation}"`);
            return Promise.resolve({
              source_lang: srcLang,
              target_lang: tgtLang,
              translated_vi: srcLang === 'en' ? argosTranslation : '',
              translated_en: srcLang === 'vi' ? argosTranslation : '',
              reply_en: '',
              reply_vi: '',
            });
          }
          // Fallback to LLM
          return provider.process(segmentTranscript || transcript, language, false, false);
        })()
      : Promise.resolve({
          source_lang: previousSourceLang,
          target_lang: previousTargetLang,
          translated_vi: previousTranslatedVi,
          translated_en: previousTranslatedEn,
          reply_en: '',
          reply_vi: '',
        });

    const resolvedResult = await result;
    const mergedResult = hasAudioChunk
      ? {
          ...resolvedResult,
          translated_vi:
            language === 'en'
              ? [previousTranslatedVi.trim(), (resolvedResult.translated_vi ?? '').trim()]
                  .filter(Boolean)
                  .join(' ')
              : '',
          translated_en:
            language === 'vi'
              ? [previousTranslatedEn.trim(), (resolvedResult.translated_en ?? '').trim()]
                  .filter(Boolean)
                  .join(' ')
              : '',
        }
      : resolvedResult;

    // Step 3: Save conversation row (non-blocking) when recording is finished
    let conversationId: string | null = null;

    if (sessionEnded) {
      const supabase = createSupabaseServer();
      const user = (await supabase.auth.getUser()).data.user;

      if (user) {
        void (async () => {
          try {
            const { error } = await supabase
              .from('conversations')
              .insert({
                user_id: user.id,
                transcript,
                translated_vi: mergedResult.translated_vi,
                reply_en: mergedResult.reply_en,
                reply_vi: mergedResult.reply_vi,
                ai_provider: 'groq',
              });

            if (error) {
              console.error('[process-audio] Background save error:', error.message);
            }
          } catch (saveErr) {
            console.error('[process-audio] Background save exception:', saveErr);
          }
        })();
      }

      // Also write to translations table (public tab source)
      void (async () => {
        try {
          const { error } = await supabase
            .from('translations')
            .insert({
              user_id: user?.id ?? null,
              transcript,
              source_lang: mergedResult.source_lang,
              target_lang: mergedResult.target_lang,
              translated_vi: mergedResult.translated_vi,
              translated_en: mergedResult.translated_en,
              reply_en: mergedResult.reply_en,
              reply_vi: mergedResult.reply_vi,
              ai_provider: 'groq',
            });

          if (error) {
            console.error('[process-audio] Background save translations error:', error.message);
          }
        } catch (saveErr) {
          console.error('[process-audio] Background save translations exception:', saveErr);
        }
      })();
    }

    // ── Return response ─────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        transcript,
        source_lang: mergedResult.source_lang,
        target_lang: mergedResult.target_lang,
        translated_vi: mergedResult.translated_vi,
        translated_en: mergedResult.translated_en,
        reply_en: mergedResult.reply_en,
        reply_vi: mergedResult.reply_vi,
        is_final: hasAudioChunk,
        is_session_end: sessionEnded,
        conversation_id: conversationId,
        session_id: sessionId,
      },
    });
  } catch (err) {
    console.error('[process-audio] Error:', err);

    const message =
      err instanceof Error ? err.message : 'Internal server error';

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
