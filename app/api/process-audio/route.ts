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

    if (!checkRateLimit(ip)) {
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

    // Step 1: Speech-to-text
    let transcript = '';
    if (file && file instanceof File) {
      const chunkTranscript = await provider.speechToText(file);
      if (!chunkTranscript || chunkTranscript.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'Could not recognize speech. Please try again.' },
          { status: 422 },
        );
      }
      transcript = [previousTranscript?.trim(), chunkTranscript.trim()]
        .filter(Boolean)
        .join(' ');
    } else if (sessionEnded && previousTranscript.trim().length > 0) {
      transcript = previousTranscript.trim();
    }

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'No transcript available to process.' },
        { status: 422 },
      );
    }

    const isFinal = segmentEnded || sessionEnded;

    // Step 2: Translate + suggest reply
    const result = await provider.process(transcript, isFinal);

    // Step 3: Save conversation row only when recording is finished
    const supabase = createSupabaseServer();
    const user = (await supabase.auth.getUser()).data.user;
    let conversationId: string | null = null;

    if (sessionEnded && user) {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          transcript,
          translated_vi: result.translated_vi,
          reply_en: result.reply_en,
          reply_vi: result.reply_vi,
          ai_provider: 'groq',
        })
        .select('id')
        .single();

      if (!convErr && conv?.id) {
        conversationId = conv.id;
      }
    }

    // ── Return response ─────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        transcript,
        source_lang: result.source_lang,
        target_lang: result.target_lang,
        translated_vi: result.translated_vi,
        translated_en: result.translated_en,
        reply_en: result.reply_en,
        reply_vi: result.reply_vi,
        is_final: isFinal,
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
