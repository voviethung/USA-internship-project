/**
 * AI Provider abstraction — supports Groq (free) and OpenAI.
 *
 * Set AI_PROVIDER=groq  or  AI_PROVIDER=openai  in .env.local
 */

import Groq from 'groq-sdk';
import OpenAI from 'openai';

// ── Shared prompt ──────────────────────────────────────────
const SYSTEM_PROMPT = `You are a bilingual assistant specialized in pharmaceutical manufacturing (QA, QC, R&D, RA).

Tasks:
1. Translate the following English text to Vietnamese.
2. Understand GMP, QA, QC, R&D context to produce accurate translations.
3. Suggest a professional reply the user could say back — in both English and Vietnamese.
4. Keep responses concise and practical.

IMPORTANT: Return ONLY valid JSON, no extra text. Schema:
{
  "translated_vi": "<Vietnamese translation>",
  "reply_vi": "<suggested reply in Vietnamese>",
  "reply_en": "<suggested reply in English>"
}`;

// ── Types ──────────────────────────────────────────────────
interface AIResult {
  translated_vi: string;
  reply_vi: string;
  reply_en: string;
}

interface AIProvider {
  speechToText(file: File, language?: 'en' | 'vi'): Promise<string>;
  process(transcript: string): Promise<AIResult>;
}

// ── Groq Provider ──────────────────────────────────────────
function createGroqProvider(): AIProvider {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  return {
    async speechToText(file: File, language: 'en' | 'vi' = 'en') {
      const transcription = await client.audio.transcriptions.create({
        file,
        model: 'whisper-large-v3-turbo',
        language,
        response_format: 'json',
      });
      return transcription.text;
    },

    async process(transcript: string) {
      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1024,
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      return JSON.parse(raw) as AIResult;
    },
  };
}

// ── OpenAI Provider ────────────────────────────────────────
function createOpenAIProvider(): AIProvider {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  return {
    async speechToText(file: File, language: 'en' | 'vi' = 'en') {
      const transcription = await client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language,
        response_format: 'json',
      });
      return transcription.text;
    },

    async process(transcript: string) {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1024,
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      return JSON.parse(raw) as AIResult;
    },
  };
}

// ── Factory ────────────────────────────────────────────────
let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_provider) return _provider;

  const name = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();

  if (name === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    _provider = createOpenAIProvider();
  } else {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not set');
    }
    _provider = createGroqProvider();
  }

  return _provider;
}
