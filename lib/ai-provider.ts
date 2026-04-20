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

interface AISummaryResult {
  summary_en: string;
  summary_vi: string;
}

type LanguageCode = 'en' | 'vi';

interface AIProvider {
  speechToText(file: File, language?: 'en' | 'vi'): Promise<string>;
  process(
    transcript: string,
    sourceLanguage: LanguageCode,
    isFinal?: boolean,
    includeReplies?: boolean,
  ): Promise<AIResult>;
  summarize(transcript: string, sourceLanguage: LanguageCode): Promise<AISummaryResult>;
}

type SelfHostedSttMode = 'off' | 'prefer' | 'only';

let selfHostedHealthCache: { ok: boolean; checkedAt: number } | null = null;

function getSelfHostedSttMode(): SelfHostedSttMode {
  const mode = (process.env.SELF_HOSTED_STT_MODE ?? 'prefer').toLowerCase();
  if (mode === 'off' || mode === 'only') return mode;
  return 'prefer';
}

function shouldUseSelfHostedStt() {
  return getSelfHostedSttMode() !== 'off' && Boolean(process.env.SELF_HOSTED_STT_URL);
}

async function isSelfHostedSttHealthy(baseUrl: string): Promise<boolean> {
  const now = Date.now();
  const cacheTtlMs = 20_000;
  if (selfHostedHealthCache && now - selfHostedHealthCache.checkedAt < cacheTtlMs) {
    return selfHostedHealthCache.ok;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);

    const ok = response.ok;
    selfHostedHealthCache = { ok, checkedAt: now };
    return ok;
  } catch {
    selfHostedHealthCache = { ok: false, checkedAt: now };
    return false;
  }
}

async function transcribeWithSelfHostedSTT(
  file: File,
  language?: 'en' | 'vi',
): Promise<string | null> {
  const baseUrl = process.env.SELF_HOSTED_STT_URL;
  if (!baseUrl || !shouldUseSelfHostedStt()) return null;

  const healthy = await isSelfHostedSttHealthy(baseUrl);
  if (!healthy) {
    console.warn('[self-hosted-stt] Healthcheck failed, skip self-hosted STT for now');
    return null;
  }

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

      // Common decode/no-speech cases from self-hosted service should not be treated as outage.
      if (response.status === 400 || response.status === 415 || response.status === 422) {
        return '';
      }

      return null;
    }

    let data: { text?: string } | null = null;
    try {
      const raw = await response.text();
      data = raw ? (JSON.parse(raw) as { text?: string } | null) : null;
    } catch (err) {
      console.warn('[self-hosted-stt] Failed to parse JSON response:', err);
      data = null;
    }
    if (!data) {
      console.warn('[self-hosted-stt] Invalid response from server (null)');
      return '';
    }
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

function inferTargetLanguage(sourceLanguage: LanguageCode): LanguageCode {
  return sourceLanguage === 'en' ? 'vi' : 'en';
}

function getSystemPrompt(
  sourceLanguage: LanguageCode,
  isFinal: boolean,
  includeReplies: boolean,
) {
  const targetLanguage = inferTargetLanguage(sourceLanguage);
  const sourceLabel = sourceLanguage === 'en' ? 'English' : 'Vietnamese';
  const targetLabel = targetLanguage === 'en' ? 'English' : 'Vietnamese';

  if (isFinal) {
    if (!includeReplies) {
      return `You are a bilingual assistant specialized in pharmaceutical manufacturing (QA, QC, R&D, RA).

Tasks:
1. The transcript source language is ${sourceLabel}.
2. Translate it into ${targetLabel}.
3. This is the final transcript of a full speech session. Produce a polished and accurate translation.
4. Return translation fields only. Leave reply fields empty.

IMPORTANT: Return ONLY valid JSON, no extra text. Schema:
{
  "source_lang": "${sourceLanguage}",
  "target_lang": "${targetLanguage}",
  "translated_vi": "<Vietnamese translation, empty if source is vi>",
  "translated_en": "<English translation, empty if source is en>",
  "reply_vi": "",
  "reply_en": ""
}`;
    }

    return `You are a bilingual assistant specialized in pharmaceutical manufacturing (QA, QC, R&D, RA).

Tasks:
1. The transcript source language is ${sourceLabel}.
2. Translate it into ${targetLabel}.
3. Understand GMP, QA, QC, R&D context to produce accurate translations.
4. This is the final transcript of the full speech session. Produce a polished, correct translation and suggest replies.
5. Suggest a professional reply the user could say back — in both English and Vietnamese.
6. Keep responses concise and practical.

IMPORTANT: Return ONLY valid JSON, no extra text. Schema:
{
  "source_lang": "${sourceLanguage}",
  "target_lang": "${targetLanguage}",
  "translated_vi": "<Vietnamese translation, empty if source is vi>",
  "translated_en": "<English translation, empty if source is en>",
  "reply_vi": "<suggested reply in Vietnamese>",
  "reply_en": "<suggested reply in English>"
}`;
  }

  return `You are a bilingual assistant specialized in pharmaceutical manufacturing (QA, QC, R&D, RA).

Tasks:
1. The transcript source language is ${sourceLabel}.
2. Translate it into ${targetLabel}.
3. Understand GMP, QA, QC, R&D context to produce accurate translations.
4. This is a partial transcript of an ongoing speech session. Keep translation coherent, but keep it concise and lightweight.
5. Do not invent missing words or conclusively change the meaning of partial fragments.
6. For partial chunks, return translation fields only. Leave reply fields empty.
7. Keep responses concise and practical.

IMPORTANT: Return ONLY valid JSON, no extra text. Schema:
{
  "source_lang": "${sourceLanguage}",
  "target_lang": "${targetLanguage}",
  "translated_vi": "<Vietnamese translation, empty if source is vi>",
  "translated_en": "<English translation, empty if source is en>",
  "reply_vi": "",
  "reply_en": ""
}`;
}

function normalizeAIResult(
  data: Partial<AIResult>,
  sourceLanguage: LanguageCode,
  includeReplies: boolean,
): AIResult {
  const targetLanguage = inferTargetLanguage(sourceLanguage);

  return {
    source_lang: sourceLanguage,
    target_lang: targetLanguage,
    translated_vi: sourceLanguage === 'en' ? (data.translated_vi ?? '') : '',
    translated_en: sourceLanguage === 'vi' ? (data.translated_en ?? '') : '',
    reply_vi: includeReplies ? (data.reply_vi ?? '') : '',
    reply_en: includeReplies ? (data.reply_en ?? '') : '',
  };
}

function getSummaryPrompt(sourceLanguage: LanguageCode) {
  const sourceLabel = sourceLanguage === 'en' ? 'English' : 'Vietnamese';

  return `You are a bilingual assistant specialized in pharmaceutical communication.

Task:
1. Read the full session transcript in ${sourceLabel}.
2. Produce a concise summary of key points in both English and Vietnamese.
3. Keep each summary practical and short (2-4 bullet points or 2-4 concise sentences).
4. Do not add facts not present in the transcript.

IMPORTANT: Return ONLY valid JSON, no extra text. Schema:
{
  "summary_en": "<short summary in English>",
  "summary_vi": "<tóm tắt ngắn bằng tiếng Việt>"
}`;
}

function normalizeSummaryResult(data: Partial<AISummaryResult>): AISummaryResult {
  return {
    summary_en: (data.summary_en ?? '').trim(),
    summary_vi: (data.summary_vi ?? '').trim(),
  };
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

      if (shouldUseSelfHostedStt()) {
        const selfHostedText = await transcribeWithSelfHostedSTT(file, language);
        if (selfHostedText !== null) {
          // Return result even if empty (no speech detected) — treat as successful no-speech, not error
          return selfHostedText;
        }

        if (getSelfHostedSttMode() === 'only') {
          console.warn('[self-hosted-stt] only mode + unavailable; degrade to empty transcript');
          return '';
        }
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

    async process(
      transcript: string,
      sourceLanguage: LanguageCode,
      isFinal: boolean = false,
      includeReplies: boolean = true,
    ) {
      try {
        const model = isFinal ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
        const maxTokens = isFinal ? 1024 : 220;
        const temperature = isFinal ? 0.3 : 0.2;

        const completion = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: getSystemPrompt(sourceLanguage, isFinal, includeReplies) },
            { role: 'user', content: transcript },
          ],
          response_format: { type: 'json_object' },
          temperature,
          max_tokens: maxTokens,
        });

        const raw = completion.choices[0]?.message?.content ?? '{}';
        return normalizeAIResult(JSON.parse(raw) as Partial<AIResult>, sourceLanguage, includeReplies);
      } catch (err) {
        if (isGroqQuotaError(err) && process.env.OPENAI_API_KEY) {
          console.warn('[process] Groq quota reached, fallback to OpenAI chat');
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const maxTokens = isFinal ? 1024 : 220;
          const temperature = isFinal ? 0.3 : 0.2;

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: getSystemPrompt(sourceLanguage, isFinal, includeReplies) },
              { role: 'user', content: transcript },
            ],
            response_format: { type: 'json_object' },
            temperature,
            max_tokens: maxTokens,
          });

          const raw = completion.choices[0]?.message?.content ?? '{}';
          return normalizeAIResult(JSON.parse(raw) as Partial<AIResult>, sourceLanguage, includeReplies);
        }

        throw err;
      }
    },

    async summarize(transcript: string, sourceLanguage: LanguageCode) {
      try {
        const completion = await client.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: getSummaryPrompt(sourceLanguage) },
            { role: 'user', content: transcript },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 320,
        });

        const raw = completion.choices[0]?.message?.content ?? '{}';
        return normalizeSummaryResult(JSON.parse(raw) as Partial<AISummaryResult>);
      } catch (err) {
        if (isGroqQuotaError(err) && process.env.OPENAI_API_KEY) {
          console.warn('[summarize] Groq quota reached, fallback to OpenAI chat');
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: getSummaryPrompt(sourceLanguage) },
              { role: 'user', content: transcript },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: 320,
          });

          const raw = completion.choices[0]?.message?.content ?? '{}';
          return normalizeSummaryResult(JSON.parse(raw) as Partial<AISummaryResult>);
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

      if (shouldUseSelfHostedStt()) {
        const selfHostedText = await transcribeWithSelfHostedSTT(file, language);
        if (selfHostedText && isMeaningfulTranscript(selfHostedText)) {
          return selfHostedText;
        }

        if (getSelfHostedSttMode() === 'only') {
          throw new Error('Self-hosted STT is enabled in only mode but is unavailable');
        }
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

    async process(
      transcript: string,
      sourceLanguage: LanguageCode,
      isFinal: boolean = false,
      includeReplies: boolean = true,
    ) {
      const maxTokens = isFinal ? 1024 : 220;
      const temperature = isFinal ? 0.3 : 0.2;

      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: getSystemPrompt(sourceLanguage, isFinal, includeReplies) },
          { role: 'user', content: transcript },
        ],
        response_format: { type: 'json_object' },
        temperature,
        max_tokens: maxTokens,
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      return normalizeAIResult(JSON.parse(raw) as Partial<AIResult>, sourceLanguage, includeReplies);
    },

    async summarize(transcript: string, sourceLanguage: LanguageCode) {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: getSummaryPrompt(sourceLanguage) },
          { role: 'user', content: transcript },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 320,
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      return normalizeSummaryResult(JSON.parse(raw) as Partial<AISummaryResult>);
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
