import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/tts — Server-side text-to-speech
 * Uses OpenAI TTS API (if key available) or returns instructions for browser fallback.
 *
 * Body: { text: string, voice?: string }
 * Returns: audio/mpeg stream or JSON fallback
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'anonymous';

    if (!checkRateLimit(`tts-${ip}`, 30, 60000)) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded.' },
        { status: 429 },
      );
    }

    const { text, voice = 'alloy', lang = 'en-US' } = await req.json();

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'No text provided.' },
        { status: 400 },
      );
    }

    // Limit text length (max 4096 chars for TTS)
    const trimmedText = text.trim().slice(0, 4096);

    // Detect if the requested language is Vietnamese
    const isVietnamese = lang.startsWith('vi');

    // Try OpenAI TTS if key is available (supports multilingual including Vietnamese)
    if (process.env.OPENAI_API_KEY) {
      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const mp3 = await client.audio.speech.create({
        model: 'tts-1',
        voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
        input: trimmedText,
        speed: 0.95,
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Try Groq TTS (Playai model) if available — skip for Vietnamese (English-only voices)
    if (process.env.GROQ_API_KEY && !isVietnamese) {
      try {
        const Groq = (await import('groq-sdk')).default;
        const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

        const response = await (client.audio as any).speech.create({
          model: 'playai-tts',
          input: trimmedText,
          voice: 'Arista-PlayAI',
          response_format: 'wav',
        });

        const buffer = Buffer.from(await response.arrayBuffer());

        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': buffer.length.toString(),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch {
        // Groq TTS not available, fall through to browser fallback
      }
    }

    // No TTS API available — instruct client to use browser speechSynthesis
    return NextResponse.json({
      success: true,
      fallback: true,
      text: trimmedText,
      message: 'No TTS API key available. Use browser speechSynthesis.',
    });
  } catch (err) {
    console.error('[tts] Error:', err);
    return NextResponse.json(
      { success: false, error: 'TTS generation failed.' },
      { status: 500 },
    );
  }
}
