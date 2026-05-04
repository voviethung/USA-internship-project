import { NextRequest, NextResponse } from 'next/server';
import { getAIProvider } from '@/lib/ai-provider';
import { checkRateLimit } from '@/lib/rate-limit';
import { createSupabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs'; // need Node for SDK file handling

type SaveContext = {
  transcript: string;
  source_lang: 'en' | 'vi';
  target_lang: 'en' | 'vi';
  translated_vi: string;
  translated_en: string;
  reply_en: string;
  reply_vi: string;
};

function normalizeLang(value: string | null | undefined): 'en' | 'vi' {
  return value === 'vi' ? 'vi' : 'en';
}

function mergeTranscriptWithOverlap(previousTranscript: string, currentChunk: string): string {
  const prev = previousTranscript.trim();
  const current = currentChunk.trim();

  if (!prev) return current;
  if (!current) return prev;
  if (prev === current) return prev;

  const prevWords = prev.split(/\s+/);
  const currentWords = current.split(/\s+/);
  const maxOverlap = Math.min(prevWords.length, currentWords.length, 24);

  let overlap = 0;
  for (let k = maxOverlap; k >= 3; k--) {
    const prevTail = prevWords.slice(-k).join(' ').toLowerCase();
    const currentHead = currentWords.slice(0, k).join(' ').toLowerCase();
    if (prevTail === currentHead) {
      overlap = k;
      break;
    }
  }

  if (overlap > 0) {
    return `${prev} ${currentWords.slice(overlap).join(' ')}`.trim();
  }

  return `${prev} ${current}`.trim();
}

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  const isDev = process.env.NODE_ENV !== 'production';

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
    let argosTranslation: string | null = null;
    let argosSourceLang: 'en' | 'vi' | null = null;
    let sttElapsedMs = 0;
    if (file && file instanceof File) {
      if (file.size === 0) {
        return NextResponse.json(
          { success: false, error: 'Audio file is empty. Please record some audio.' },
          { status: 400 },
        );
      }
      
      const sttStartedAt = Date.now();
      const sttResult = await provider.speechToText(file, language);
      sttElapsedMs = Date.now() - sttStartedAt;
      const currentChunkTranscript = (sttResult.text ?? '').trim();
      argosTranslation = sttResult.translation;
      argosSourceLang = sttResult.source_lang;
      const shouldMergeChunk = sttResult.should_merge !== false;
      const sttQualityScore =
        typeof sttResult.quality_score === 'number' ? sttResult.quality_score : null;
      const cleanedTranscript = currentChunkTranscript.replace(
        /[\s.,!?;:'"“”‘’`~\-_=+()\[\]{}<>/\\|@#$%^&*…]+/g,
        '',
      );

      if (!shouldMergeChunk) {
        if (isDev) {
          console.log('[process-audio] drop weak chunk', {
            sttQualityScore,
            hallucinationRemoved: Boolean(sttResult.hallucination_removed),
            segmentEnded,
            sessionEnded,
          });
        }
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
        : mergeTranscriptWithOverlap(previousTranscript, currentChunkTranscript);
      }
      }
    } else if (sessionEnded && previousTranscript.trim().length > 0) {
      transcript = previousTranscript.trim();
    }

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json({
        success: true,
        no_speech: true,
        data: null,
        session_id: sessionId,
        is_session_end: sessionEnded,
      });
    }

    // Step 2: Segment translation strategy (OFFLINE ONLY)
    // - Use Argos translation returned by self-hosted STT
    // - Do NOT fallback to Groq/OpenAI for live translation
    // - sessionEnded without new audio: skip translation, reuse previous
    const hasAudioChunk = Boolean(file && file instanceof File);

    const result = hasAudioChunk
      ? (() => {
          // If self-hosted STT returned Argos translation -> use it directly
          if (argosTranslation) {
            const srcLang = argosSourceLang ?? language;
            const tgtLang = srcLang === 'en' ? 'vi' : 'en';
            console.log(`[process-audio] Using Argos translation (offline-only): "${argosTranslation}"`);
            return Promise.resolve({
              source_lang: srcLang,
              target_lang: tgtLang,
              translated_vi: srcLang === 'en' ? argosTranslation : '',
              translated_en: srcLang === 'vi' ? argosTranslation : '',
              reply_en: '',
              reply_vi: '',
            });
          }

          // Offline-only mode: Argos translation is required for new audio chunks.
          throw new Error(
            'Argos offline translation is unavailable for this segment. Please check stt-api/argos-api health.',
          );
        })()
      : Promise.resolve({
          source_lang: previousSourceLang,
          target_lang: previousTargetLang,
          translated_vi: previousTranslatedVi,
          translated_en: previousTranslatedEn,
          reply_en: '',
          reply_vi: '',
        });

    const translationStartedAt = Date.now();
    const resolvedResult = await result;
    const translationElapsedMs = Date.now() - translationStartedAt;
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

    // Step 3: Save conversation row when recording is finished.
    // Return persisted flag so client can run fallback save only when needed.
    let persisted = !sessionEnded;
    if (sessionEnded) {
      const supabase = createSupabaseServer();
      try {
        const user = (await supabase.auth.getUser()).data.user;
        const savePayload: SaveContext = {
          transcript,
          source_lang: normalizeLang(mergedResult.source_lang),
          target_lang: normalizeLang(mergedResult.target_lang),
          translated_vi: mergedResult.translated_vi,
          translated_en: mergedResult.translated_en,
          reply_en: mergedResult.reply_en,
          reply_vi: mergedResult.reply_vi,
        };

        const cutoffIso = new Date(Date.now() - 2 * 60_000).toISOString();
        let duplicateQuery = supabase
          .from('translations')
          .select('id, created_at')
          .eq('transcript', savePayload.transcript)
          .gte('created_at', cutoffIso)
          .order('created_at', { ascending: false })
          .limit(1);

        duplicateQuery = user
          ? duplicateQuery.eq('user_id', user.id)
          : duplicateQuery.is('user_id', null);

        const duplicateRes = await duplicateQuery;
        if (duplicateRes.data && duplicateRes.data.length > 0) {
          persisted = true;
        } else {
          if (user) {
            const { error: conversationError } = await supabase
              .from('conversations')
              .insert({
                user_id: user.id,
                transcript: savePayload.transcript,
                translated_vi: savePayload.translated_vi,
                reply_en: savePayload.reply_en,
                reply_vi: savePayload.reply_vi,
                ai_provider: 'groq',
              });

            if (conversationError) {
              console.error('[process-audio] Save conversation error:', conversationError.message);
            }
          }

          const { error: translationError } = await supabase
            .from('translations')
            .insert({
              user_id: user?.id ?? null,
              transcript: savePayload.transcript,
              source_lang: savePayload.source_lang,
              target_lang: savePayload.target_lang,
              translated_vi: savePayload.translated_vi,
              translated_en: savePayload.translated_en,
              reply_en: savePayload.reply_en,
              reply_vi: savePayload.reply_vi,
              ai_provider: 'groq',
            });

          if (translationError) {
            persisted = false;
            console.error('[process-audio] Save translations error:', translationError.message);
          } else {
            persisted = true;
          }
        }
      } catch (saveErr) {
        persisted = false;
        console.error('[process-audio] Save translations exception:', saveErr);
      }
    }

    if (isDev) {
      console.log('[process-audio] timing', {
        sessionEnded,
        hasAudioChunk,
        sttElapsedMs,
        translationElapsedMs,
        totalElapsedMs: Date.now() - requestStartedAt,
      });
    }

    // ── Return response ─────────────────────────────────
    return NextResponse.json({
      success: true,
      persisted,
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
        conversation_id: null,
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
