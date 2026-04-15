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
1. Detect whether the input text is English or Vietnamese.
2. If the input is English, translate it to Vietnamese.
3. If the input is Vietnamese, translate it to English.
4. Understand GMP, QA, QC, R&D context to produce accurate translations.
5. If the transcript is part of an ongoing speech session, use previous context and keep translation coherent across chunks.
6. Suggest a professional reply the user could say back — in both English and Vietnamese.
7. Keep responses concise and practical.

IMPORTANT: Return ONLY valid JSON, no extra text. Schema:
{
  "source_lang": "en" | "vi",
  "target_lang": "vi" | "en",
  "translated_vi": "<Vietnamese translation, empty if source is vi>",
  "translated_en": "<English translation, empty if source is en>",
  "reply_vi": "<suggested reply in Vietnamese>",
  "reply_en": "<suggested reply in English>"
}`;

// ── Types ──────────────────────────────────────────────────
interface AIResult {
  source_lang: 'en' | 'vi';
  target_lang: 'en' | 'vi';
  translated_vi: string;
  translated_en: string;
  reply_vi: string;
  reply_en: string;
}

interface AIProvider {
  speechToText(file: File, language?: 'en' | 'vi'): Promise<string>;
  process(transcript: string, isFinal?: boolean): Promise<AIResult>;
}

async function transcribeWithSelfHostedSTT(
  file: File,
  language?: 'en' | 'vi',
): Promise<string | null> {
  const baseUrl = process.env.SELF_HOSTED_STT_URL;
  if (!baseUrl) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const formData = new FormData();
    formData.append('file', file);
    if (language) {
      formData.append('language', language);
    }

    const headers: HeadersInit = {};
    if (process.env.SELF_HOSTED_STT_KEY) {
      headers['x-stt-key'] = process.env.SELF_HOSTED_STT_KEY;
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/transcribe`, {
      method: 'POST',
      body: formData,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[self-hosted-stt] HTTP ${response.status}: ${body}`);
      return null;
    }

    const data = (await response.json()) as { text?: string };
    const text = data.text?.trim() ?? '';
    console.log(`[self-hosted-stt] Transcription result: "${text}"`);
    return text;
  } catch (err) {
    console.warn('[self-hosted-stt] Request failed, falling back to managed STT:', err);
    return null;
  }
}

function isMeaningfulTranscript(text: string): boolean {
  const normalized = text
    .trim()
    .replace(/[\s.,!?;:'"“”‘’`~\-_=+()\[\]{}<>/\\|@#$%^&*…]+/g, '');
  return normalized.length >= 2;
}

function isGroqQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    message.includes('rate limit reached') ||
    message.includes('tokens per day') ||
    message.includes('tpm') ||
    message.includes('tpd') ||
    message.includes('status: 429') ||
    message.includes(' 429 ')
  );
}

function getSystemPrompt(isFinal: boolean) {
  if (isFinal) {
    return `You are a bilingual assistant specialized in pharmaceutical manufacturing (QA, QC, R&D, RA).

Tasks:
1. Detect whether the input text is English or Vietnamese.
2. If the input is English, translate it to Vietnamese.
3. If the input is Vietnamese, translate it to English.
4. Understand GMP, QA, QC, R&D context to produce accurate translations.
5. This is the final transcript of the full speech session. Produce a polished, correct translation and suggest replies.
6. Suggest a professional reply the user could say back — in both English and Vietnamese.
7. Keep responses concise and practical.

IMPORTANT: Return ONLY valid JSON, no extra text. Schema:
{
  "source_lang": "en" | "vi",
  "target_lang": "vi" | "en",
  "translated_vi": "<Vietnamese translation, empty if source is vi>",
  "translated_en": "<English translation, empty if source is en>",
  "reply_vi": "<suggested reply in Vietnamese>",
  "reply_en": "<suggested reply in English>"
}`;
  }

  return `You are a bilingual assistant specialized in pharmaceutical manufacturing (QA, QC, R&D, RA).

Tasks:
1. Detect whether the input text is English or Vietnamese.
2. If the input is English, translate it to Vietnamese.
3. If the input is Vietnamese, translate it to English.
4. Understand GMP, QA, QC, R&D context to produce accurate translations.
5. This is a partial transcript of an ongoing speech session. Use previous context and keep translation coherent, but do not finalize sentence structure until the final chunk arrives.
6. Do not invent missing words or conclusively change the meaning of partial fragments.
7. Suggest a professional reply the user could say back — in both English and Vietnamese.
8. Keep responses concise and practical.

IMPORTANT: Return ONLY valid JSON, no extra text. Schema:
{
  "source_lang": "en" | "vi",
  "target_lang": "vi" | "en",
  "translated_vi": "<Vietnamese translation, empty if source is vi>",
  "translated_en": "<English translation, empty if source is en>",
  "reply_vi": "<suggested reply in Vietnamese>",
  "reply_en": "<suggested reply in English>"
}`;
}

// ── Groq Provider ──────────────────────────────────────────
function createGroqProvider(): AIProvider {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  return {
    async speechToText(file: File, language?: 'en' | 'vi') {
      console.log(`[speechToText] Received file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
      
      if (file.size === 0) {
        console.warn('[speechToText] File is empty');
        return '';
      }

      const selfHostedText = await transcribeWithSelfHostedSTT(file, language);
      if (selfHostedText && isMeaningfulTranscript(selfHostedText)) {
        return selfHostedText;
      }
      
      try {
        // Pass File directly to Groq SDK - do NOT convert to Buffer
        // SDK handles FormData conversion internally
        const options: any = {
          file,
          model: 'whisper-large-v3-turbo',
          response_format: 'json',
        };
        if (language) {
          options.language = language;
        }
        
        console.log(`[speechToText] Sending file to Whisper API...`);
        const transcription = await client.audio.transcriptions.create(options);
        const groqText = transcription.text || '';
        console.log(`[speechToText] Transcription result: "${groqText}"`);

        if (isMeaningfulTranscript(groqText)) {
          return groqText;
        }

        // Fallback to OpenAI Whisper when Groq returns punctuation-only output
        if (process.env.OPENAI_API_KEY) {
          try {
            console.warn('[speechToText] Groq transcript not meaningful, fallback to OpenAI Whisper');
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const openaiOptions: any = {
              file,
              model: 'whisper-1',
              response_format: 'json',
            };
            if (language) {
              openaiOptions.language = language;
            }
            const openaiResult = await openai.audio.transcriptions.create(openaiOptions);
            const openaiText = openaiResult.text || '';
            console.log(`[speechToText] OpenAI fallback result: "${openaiText}"`);
            return openaiText;
          } catch (fallbackErr) {
            console.error('[speechToText] OpenAI fallback failed:', fallbackErr);
          }
        }

        return groqText;
      } catch (err) {
        console.error('[speechToText] Error:', err instanceof Error ? err.message : err);
        if (err instanceof Error && err.message) {
          console.error('[speechToText] Full error:', err);
        }
        return '';
      }
    },

    async process(transcript: string, isFinal: boolean = false) {
      try {
        const completion = await client.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: getSystemPrompt(isFinal) },
            { role: 'user', content: transcript },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 1024,
        });

        const raw = completion.choices[0]?.message?.content ?? '{}';
        return JSON.parse(raw) as AIResult;
      } catch (err) {
        if (isGroqQuotaError(err) && process.env.OPENAI_API_KEY) {
          console.warn('[process] Groq quota reached, fallback to OpenAI chat');
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: getSystemPrompt(isFinal) },
              { role: 'user', content: transcript },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 1024,
          });

          const raw = completion.choices[0]?.message?.content ?? '{}';
          return JSON.parse(raw) as AIResult;
        }

        throw err;
      }
    },
  };
}

// ── OpenAI Provider ────────────────────────────────────────
function createOpenAIProvider(): AIProvider {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  return {
    async speechToText(file: File, language?: 'en' | 'vi') {
      console.log(`[OpenAI speechToText] Received file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
      
      if (file.size === 0) {
        console.warn('[OpenAI speechToText] File is empty');
        return '';
      }

      const selfHostedText = await transcribeWithSelfHostedSTT(file, language);
      if (selfHostedText && isMeaningfulTranscript(selfHostedText)) {
        return selfHostedText;
      }
      
      try {
        // Pass File directly to OpenAI SDK - do NOT convert to Buffer
        // SDK handles FormData conversion internally
        const options: any = {
          file,
          model: 'whisper-1',
          response_format: 'json',
        };
        if (language) {
          options.language = language;
        }
        
        console.log(`[OpenAI speechToText] Sending file to Whisper API...`);
        const transcription = await client.audio.transcriptions.create(options);
        console.log(`[OpenAI speechToText] Transcription result: "${transcription.text}"`);
        return transcription.text || '';
      } catch (err) {
        console.error('[OpenAI speechToText] Error:', err instanceof Error ? err.message : err);
        if (err instanceof Error && err.message) {
          console.error('[OpenAI speechToText] Full error:', err);
        }
        return '';
      }
    },

    async process(transcript: string, isFinal: boolean = false) {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: getSystemPrompt(isFinal) },
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
