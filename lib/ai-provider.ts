/**
 * AI Provider abstraction — supports Groq (free) and OpenAI.
 *
 * Set AI_PROVIDER=groq  or  AI_PROVIDER=openai  in .env.local
 */

import Groq from 'groq-sdk';
import OpenAI from 'openai';

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

interface TranscriptionOptions {
  file: File;
  model: 'whisper-large-v3-turbo' | 'whisper-1';
  response_format: 'json';
  language?: 'en' | 'vi';
}

interface AIProvider {
  speechToText(file: File, language?: 'en' | 'vi'): Promise<SttResult>;
  process(
    transcript: string,
    sourceLanguage: LanguageCode,
    isFinal?: boolean,
    includeReplies?: boolean,
  ): Promise<AIResult>;
  summarize(transcript: string, sourceLanguage: LanguageCode): Promise<AISummaryResult>;
}

type SelfHostedSttMode = 'off' | 'prefer' | 'only';
type SelfHostedTranslateMode = 'off' | 'prefer' | 'only';

let selfHostedHealthCache: { ok: boolean; checkedAt: number } | null = null;
let selfHostedTranslateHealthCache: { ok: boolean; checkedAt: number } | null = null;

function getSelfHostedSttMode(): SelfHostedSttMode {
  const mode = (process.env.SELF_HOSTED_STT_MODE ?? 'prefer').toLowerCase();
  if (mode === 'off' || mode === 'only') return mode;
  return 'prefer';
}

function shouldUseSelfHostedStt() {
  return getSelfHostedSttMode() !== 'off' && Boolean(process.env.SELF_HOSTED_STT_URL);
}

function getSelfHostedTranslateMode(): SelfHostedTranslateMode {
  const mode = (process.env.SELF_HOSTED_TRANSLATE_MODE ?? 'prefer').toLowerCase();
  if (mode === 'off' || mode === 'only') return mode;
  return 'prefer';
}

function shouldUseSelfHostedTranslate() {
  return (
    getSelfHostedTranslateMode() !== 'off' &&
    Boolean(process.env.SELF_HOSTED_TRANSLATE_URL)
  );
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

async function isSelfHostedTranslateHealthy(baseUrl: string): Promise<boolean> {
  const now = Date.now();
  const cacheTtlMs = 20_000;
  if (selfHostedTranslateHealthCache && now - selfHostedTranslateHealthCache.checkedAt < cacheTtlMs) {
    return selfHostedTranslateHealthCache.ok;
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
    selfHostedTranslateHealthCache = { ok, checkedAt: now };
    return ok;
  } catch {
    selfHostedTranslateHealthCache = { ok: false, checkedAt: now };
    return false;
  }
}

async function translateWithSelfHostedOffline(
  text: string,
  sourceLanguage: LanguageCode,
): Promise<AIResult | null> {
  const baseUrl = process.env.SELF_HOSTED_TRANSLATE_URL;
  if (!baseUrl || !shouldUseSelfHostedTranslate()) return null;

  const healthy = await isSelfHostedTranslateHealthy(baseUrl);
  if (!healthy) {
    console.warn('[self-hosted-translate] Healthcheck failed, skip offline translator for now');
    return null;
  }

  const targetLanguage = inferTargetLanguage(sourceLanguage);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (process.env.SELF_HOSTED_TRANSLATE_KEY) {
      headers['x-translate-key'] = process.env.SELF_HOSTED_TRANSLATE_KEY;
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/translate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        source_lang: sourceLanguage,
        target_lang: targetLanguage,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[self-hosted-translate] HTTP ${response.status}`);
      return null;
    }

    const payload = (await response.json()) as { translated_text?: string };
    const translatedText = (payload.translated_text ?? '').trim();
    if (!translatedText) return null;

    return {
      source_lang: sourceLanguage,
      target_lang: targetLanguage,
      translated_vi: sourceLanguage === 'en' ? translatedText : '',
      translated_en: sourceLanguage === 'vi' ? translatedText : '',
      reply_vi: '',
      reply_en: '',
    };
  } catch (err) {
    console.warn('[self-hosted-translate] Request failed:', err);
    return null;
  }
}

interface SttResult {
  text: string;
  translation: string | null;
  source_lang: 'en' | 'vi' | null;
  quality_score?: number;
  should_merge?: boolean;
  hallucination_removed?: boolean;
}

async function transcribeWithSelfHostedSTT(
  file: File,
  language?: 'en' | 'vi',
): Promise<SttResult | null> {
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
        return {
          text: '',
          translation: null,
          source_lang: null,
          quality_score: 0,
          should_merge: false,
          hallucination_removed: false,
        };
      }

      return null;
    }

    type SttJsonResponse = {
      text?: string;
      translation?: string | null;
      source_lang?: string | null;
      quality_score?: number;
      should_merge?: boolean;
      hallucination_removed?: boolean;
    };
    let data: SttJsonResponse | null = null;
    try {
      const raw = await response.text();
      data = raw ? (JSON.parse(raw) as SttJsonResponse) : null;
    } catch (err) {
      console.warn('[self-hosted-stt] Failed to parse JSON response:', err);
      data = null;
    }
    if (!data) {
      console.warn('[self-hosted-stt] Invalid response from server (null)');
      return {
        text: '',
        translation: null,
        source_lang: null,
        quality_score: 0,
        should_merge: false,
        hallucination_removed: false,
      };
    }
    const text = data.text?.trim() ?? '';
    const translation = data.translation?.trim() ?? null;
    const source_lang = (data.source_lang === 'vi' ? 'vi' : 'en') as 'en' | 'vi';
    const qualityScore =
      typeof data.quality_score === 'number' && Number.isFinite(data.quality_score)
        ? Math.max(0, Math.min(1, data.quality_score))
        : undefined;
    const shouldMerge =
      typeof data.should_merge === 'boolean'
        ? data.should_merge
        : text.length > 0;
    const hallucinationRemoved = Boolean(data.hallucination_removed);
    console.log(
      `[self-hosted-stt] transcript="${text}" source_lang=${source_lang} translation="${translation}" quality=${qualityScore} should_merge=${shouldMerge} hallucination_removed=${hallucinationRemoved}`,
    );
    return {
      text,
      translation: translation || null,
      source_lang,
      quality_score: qualityScore,
      should_merge: shouldMerge,
      hallucination_removed: hallucinationRemoved,
    };
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

function isJsonGenerationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    message.includes('failed to generate json') ||
    message.includes('json_validation_failed') ||
    message.includes('completion tokens reached before generating a valid document') ||
    message.includes('failed_generation')
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
    async speechToText(file: File, language?: 'en' | 'vi'): Promise<SttResult> {
      console.log(`[speechToText] Received file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
      
      if (file.size === 0) {
        console.warn('[speechToText] File is empty');
        return { text: '', translation: null, source_lang: null };
      }

      if (shouldUseSelfHostedStt()) {
        const sttResult = await transcribeWithSelfHostedSTT(file, language);
        if (sttResult !== null) {
          return sttResult;
        }

        if (getSelfHostedSttMode() === 'only') {
          console.warn('[self-hosted-stt] only mode + unavailable; degrade to empty transcript');
          return { text: '', translation: null, source_lang: null };
        }
      }
      
      try {
        // Pass File directly to Groq SDK - do NOT convert to Buffer
        // SDK handles FormData conversion internally
        const options: TranscriptionOptions = {
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
          return { text: groqText, translation: null, source_lang: null };
        }

        // Fallback to OpenAI Whisper when Groq returns punctuation-only output
        if (process.env.OPENAI_API_KEY) {
          try {
            console.warn('[speechToText] Groq transcript not meaningful, fallback to OpenAI Whisper');
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const openaiOptions: TranscriptionOptions = {
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
            return { text: openaiText, translation: null, source_lang: null };
          } catch (fallbackErr) {
            console.error('[speechToText] OpenAI fallback failed:', fallbackErr);
          }
        }

        return { text: groqText, translation: null, source_lang: null };
      } catch (err) {
        console.error('[speechToText] Error:', err instanceof Error ? err.message : err);
        if (err instanceof Error && err.message) {
          console.error('[speechToText] Full error:', err);
        }
        return { text: '', translation: null, source_lang: null };
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
        const maxTokens = isFinal ? 1200 : 420;
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
        if (isJsonGenerationError(err)) {
          try {
            const retryCompletion = await client.chat.completions.create({
              model: isFinal ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant',
              messages: [
                {
                  role: 'system',
                  content:
                    `${getSystemPrompt(sourceLanguage, isFinal, includeReplies)}\n` +
                    'Keep sentences concise. Never include markdown. Return strict JSON only.',
                },
                { role: 'user', content: transcript },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1,
              max_tokens: isFinal ? 1600 : 700,
            });

            const retryRaw = retryCompletion.choices[0]?.message?.content ?? '{}';
            return normalizeAIResult(
              JSON.parse(retryRaw) as Partial<AIResult>,
              sourceLanguage,
              includeReplies,
            );
          } catch {
            // continue to quota/fallback handling below
          }
        }

        if (isGroqQuotaError(err) || isJsonGenerationError(err)) {
          const offlineResult = await translateWithSelfHostedOffline(transcript, sourceLanguage);
          if (offlineResult) {
            console.warn('[process] Falling back to self-hosted Argos translation');
            return {
              ...offlineResult,
              reply_vi: includeReplies ? 'Offline translation mode is active.' : '',
              reply_en: includeReplies ? 'Offline translation mode is active.' : '',
            };
          }

          if (getSelfHostedTranslateMode() === 'only') {
            throw new Error(
              'Groq/OpenAI unavailable and SELF_HOSTED_TRANSLATE_MODE=only but Argos translator is unreachable.',
            );
          }
        }

        if (isGroqQuotaError(err) && process.env.OPENAI_API_KEY) {
          console.warn('[process] Groq quota reached, fallback to OpenAI chat');
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const maxTokens = isFinal ? 1200 : 420;
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
    async speechToText(file: File, language?: 'en' | 'vi'): Promise<SttResult> {
      console.log(`[OpenAI speechToText] Received file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
      
      if (file.size === 0) {
        console.warn('[OpenAI speechToText] File is empty');
        return { text: '', translation: null, source_lang: null };
      }

      if (shouldUseSelfHostedStt()) {
        const sttResult = await transcribeWithSelfHostedSTT(file, language);
        if (sttResult !== null && isMeaningfulTranscript(sttResult.text)) {
          return sttResult;
        }

        if (getSelfHostedSttMode() === 'only') {
          throw new Error('Self-hosted STT is enabled in only mode but is unavailable');
        }
      }
      
      try {
        const options: TranscriptionOptions = {
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
        return { text: transcription.text || '', translation: null, source_lang: null };
      } catch (err) {
        console.error('[OpenAI speechToText] Error:', err instanceof Error ? err.message : err);
        if (err instanceof Error && err.message) {
          console.error('[OpenAI speechToText] Full error:', err);
        }
        return { text: '', translation: null, source_lang: null };
      }
    },

    async process(
      transcript: string,
      sourceLanguage: LanguageCode,
      isFinal: boolean = false,
      includeReplies: boolean = true,
    ) {
      const maxTokens = isFinal ? 1200 : 420;
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
