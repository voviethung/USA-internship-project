import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// ── Prompts ─────────────────────────────────────────────────

const VI_TO_EN_PROMPT = `You are a bilingual assistant specialized in pharmaceutical manufacturing (QA, QC, R&D, RA, GMP).

The user typed Vietnamese text. Your tasks:
1. Translate it to natural, professional English.
2. If there are pharmaceutical terms, provide the correct English terminology.

IMPORTANT: Return ONLY valid JSON, no extra text. Schema:
{
  "mode": "vi_to_en",
  "translation": "<English translation>",
  "notes": "<optional: brief note about key pharma terms used, or empty string>"
}`;

const EN_HELPER_PROMPT = `You are an English language tutor specialized in pharmaceutical manufacturing context (QA, QC, R&D, RA, GMP).

The user typed English text. Your tasks:
1. Check grammar and suggest corrections if needed.
2. Suggest better vocabulary or more professional alternatives if applicable.
3. If the text is already correct, confirm it and optionally suggest a more advanced way to say it.

IMPORTANT: Return ONLY valid JSON, no extra text. Schema:
{
  "mode": "en_helper",
  "corrected": "<corrected English text, or same text if already correct>",
  "is_correct": <true or false>,
  "suggestions": [
    {
      "type": "grammar" | "vocabulary" | "style",
      "original": "<the word or phrase>",
      "suggestion": "<better alternative>",
      "explanation": "<brief explanation in Vietnamese>"
    }
  ]
}`;

// ── Detect language ─────────────────────────────────────────

function isVietnamese(text: string): boolean {
  // Vietnamese-specific diacritics that don't appear in English
  const viRegex =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  return viRegex.test(text);
}

// ── Handler ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'anonymous';

    if (!checkRateLimit(ip, 15, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again in 1 minute.' },
        { status: 429 },
      );
    }

    const { text } = await req.json();

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'No text provided.' },
        { status: 400 },
      );
    }

    const trimmed = text.trim();
    const isVi = isVietnamese(trimmed);
    const systemPrompt = isVi ? VI_TO_EN_PROMPT : EN_HELPER_PROMPT;

    // Use the same AI provider logic
    const provider = process.env.AI_PROVIDER || 'groq';
    let result: string;

    if (provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: trimmed },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1024,
      });

      result = completion.choices[0]?.message?.content ?? '{}';
    } else {
      const { default: Groq } = await import('groq-sdk');
      const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: trimmed },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1024,
      });

      result = completion.choices[0]?.message?.content ?? '{}';
    }

    const parsed = JSON.parse(result);

    return NextResponse.json({
      success: true,
      data: parsed,
    });
  } catch (err) {
    console.error('[language-helper] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to process text';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
