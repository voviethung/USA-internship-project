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

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No audio file provided.' },
        { status: 400 },
      );
    }

    // Validate file size (max 25 MB — Whisper limit)
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum 25 MB.' },
        { status: 400 },
      );
    }

    // ── AI Processing ───────────────────────────────────
    const provider = getAIProvider();

    // Step 1: Speech-to-text
    const transcript = await provider.speechToText(file);

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Could not recognize speech. Please try again.' },
        { status: 422 },
      );
    }

    // Step 2: Translate + suggest reply
    const result = await provider.process(transcript);

    // Step 3: Save conversation segment (speaker = 'user')
    const supabase = createSupabaseServer();
    // For now, create a new conversation row and a single segment per audio
    const user = (await supabase.auth.getUser()).data.user;
    let conversationId: string | null = null;
    if (user) {
      // Insert conversation
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
        // Insert segment
        await supabase.from('conversation_segments').insert({
          conversation_id: conversationId,
          speaker: 'user',
          start_time: 0,
          end_time: 0,
          transcript,
        });
      }
    }

    // ── Return response ─────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        transcript,
        translated_vi: result.translated_vi,
        reply_en: result.reply_en,
        reply_vi: result.reply_vi,
        conversation_id: conversationId,
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
