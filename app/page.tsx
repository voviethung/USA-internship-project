'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProcessResult } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { enqueueRequest, processQueue } from '@/lib/offline-queue';
import Header from '@/components/Header';
import Recorder from '@/components/Recorder';
import ResultBox from '@/components/ResultBox';
import OfflineBanner from '@/components/OfflineBanner';

const GUEST_HISTORY_KEY = 'guest_conversations';
const MAX_GUEST_HISTORY_ITEMS = 50;

interface TranslationSavePayload {
  sessionId: string;
  transcript: string;
  source_lang?: 'en' | 'vi';
  target_lang?: 'en' | 'vi';
  translated_vi?: string;
  translated_en?: string;
  reply_en?: string;
  reply_vi?: string;
}

function extractNewSegment(previousText: string, nextText: string): string {
  const prev = previousText.trim();
  const next = nextText.trim();

  if (!next) return '';
  if (!prev) return next;

  if (next.startsWith(prev)) {
    return next.slice(prev.length).trim();
  }

  return next;
}

function saveGuestConversation(result: ProcessResult) {
  if (typeof window === 'undefined') return;
  const transcript = result.transcript?.trim() ?? '';
  if (!transcript) return;

  const raw = localStorage.getItem(GUEST_HISTORY_KEY);
  const existing = raw ? JSON.parse(raw) : [];

  const nextItem = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? (crypto as Crypto).randomUUID()
        : `guest-${Date.now()}-${Math.random()}`,
    user_id: 'guest',
    transcript,
    translated_vi: result.translated_vi ?? null,
    reply_en: result.reply_en ?? null,
    reply_vi: result.reply_vi ?? null,
    audio_duration: null,
    ai_provider: 'groq',
    file_url: null,
    file_name: null,
    file_type: null,
    created_at: new Date().toISOString(),
  };

  const next = [nextItem, ...existing].slice(0, MAX_GUEST_HISTORY_ITEMS);
  localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(next));
}

export default function HomePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRealtimeProcessing, setIsRealtimeProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const previousTranscriptRef = useRef<string>('');
  const previousSourceLangRef = useRef<'en' | 'vi'>('en');
  const previousTranslatedViRef = useRef<string>('');
  const previousTranslatedEnRef = useRef<string>('');
  const chunkQueueRef = useRef<
    Array<{
      chunk: Blob | null;
      segmentEnded: boolean;
      sessionEnded: boolean;
      language: 'en' | 'vi';
    }>
  >([]);
  const isChunkProcessingRef = useRef(false);
  const isDevRef = useRef(process.env.NODE_ENV !== 'production');
  const persistedSessionIdsRef = useRef<Set<string>>(new Set());
  const diagnosticThrottleRef = useRef<Record<string, number>>({});
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(true);
  const speechQueueRef = useRef<Array<{ text: string; lang: string }>>([]);
  const isSpeakingRef = useRef(false);

  const persistTranslationSession = useCallback(
    async (payload: TranslationSavePayload) => {
      const body = JSON.stringify(payload);
      const headers = { 'Content-Type': 'application/json' };

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch('/api/translations-save', {
            method: 'POST',
            headers,
            body,
          });

          if (response.ok) {
            return;
          }

          // Do not keep retrying on client-side validation errors.
          if (response.status >= 400 && response.status < 500) {
            break;
          }
        } catch {
          // Retry a few times before queueing for offline/background replay.
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
      }

      await enqueueRequest('/api/translations-save', 'POST', body, headers);
      showToast('Session save queued. It will sync automatically.', 'info');
    },
    [showToast],
  );

  const pumpSpeechQueue = useCallback(() => {
    if (!autoSpeakEnabled) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeakingRef.current) return;

    const next = speechQueueRef.current.shift();
    if (!next) return;

    isSpeakingRef.current = true;

    // Must stay synchronous to preserve browser user-gesture context for speechSynthesis
    const doSpeak = (voices: SpeechSynthesisVoice[]) => {
      const utterance = new SpeechSynthesisUtterance(next.text);
      utterance.lang = next.lang;
      utterance.rate = 0.94;
      // Explicitly pick a matching voice (fixes Vietnamese on Chrome)
      const normalizedLang = next.lang.toLowerCase();
      const langPrefix = normalizedLang.split('-')[0];
      const matched =
        voices.find((v) => v.lang.toLowerCase() === normalizedLang) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
        voices.find((v) => v.lang.toLowerCase().includes(langPrefix)) ||
        null;

      // Mobile browsers often have no Vietnamese voice; try server audio for VI in that case.
      if (langPrefix === 'vi' && !matched) {
        void (async () => {
          try {
            const res = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: next.text, voice: 'alloy', lang: next.lang }),
            });

            const contentType = res.headers.get('content-type') || '';
            if (!res.ok || !contentType.includes('audio/')) {
              // Last resort: let browser default voice attempt playback.
              utterance.onend = () => {
                isSpeakingRef.current = false;
                pumpSpeechQueue();
              };
              utterance.onerror = () => {
                isSpeakingRef.current = false;
                pumpSpeechQueue();
              };
              window.speechSynthesis.speak(utterance);
              return;
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => {
              URL.revokeObjectURL(url);
              isSpeakingRef.current = false;
              pumpSpeechQueue();
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              isSpeakingRef.current = false;
              pumpSpeechQueue();
            };
            await audio.play();
          } catch {
            // Last resort: let browser default voice attempt playback.
            utterance.onend = () => {
              isSpeakingRef.current = false;
              pumpSpeechQueue();
            };
            utterance.onerror = () => {
              isSpeakingRef.current = false;
              pumpSpeechQueue();
            };
            window.speechSynthesis.speak(utterance);
          }
        })();
        return;
      }

      if (matched) utterance.voice = matched;
      utterance.onend = () => {
        isSpeakingRef.current = false;
        pumpSpeechQueue();
      };
      utterance.onerror = () => {
        isSpeakingRef.current = false;
        pumpSpeechQueue();
      };
      window.speechSynthesis.speak(utterance);
    };

    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    if (voices.length > 0) {
      doSpeak(voices);
    } else {
      // Some browsers never fire voiceschanged reliably. Wait briefly, then speak anyway.
      let hasSpoken = false;
      const speakOnce = () => {
        if (hasSpoken) return;
        hasSpoken = true;
        synth.removeEventListener('voiceschanged', onVoicesChanged);
        doSpeak(synth.getVoices());
      };
      const onVoicesChanged = () => {
        clearTimeout(fallbackTimer);
        speakOnce();
      };
      synth.addEventListener('voiceschanged', onVoicesChanged);
      const fallbackTimer = window.setTimeout(speakOnce, 250);
    }
  }, [autoSpeakEnabled]);

  const enqueueTranslatedSegmentSpeech = useCallback(
    (text: string, lang: string) => {
      const normalizedText = text.trim();
      if (!autoSpeakEnabled || !normalizedText) return;
      speechQueueRef.current.push({ text: normalizedText, lang });
      pumpSpeechQueue();
    },
    [autoSpeakEnabled, pumpSpeechQueue],
  );

  const showDiagnosticToast = useCallback(
    (key: string, message: string, type: 'info' | 'warning' | 'error' = 'warning') => {
      const now = Date.now();
      const lastAt = diagnosticThrottleRef.current[key] ?? 0;
      if (now - lastAt < 1500) return;
      diagnosticThrottleRef.current[key] = now;
      showToast(message, type);
    },
    [showToast],
  );

  const handleToggleAutoSpeak = useCallback(() => {
    setAutoSpeakEnabled((prev) => {
      const next = !prev;
      if (!next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        speechQueueRef.current = [];
        isSpeakingRef.current = false;
        window.speechSynthesis.cancel();
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [showToast]);

  // ── Detect online/offline ────────────────────────────
  useEffect(() => {
    const goOffline = () => {
      setIsOffline(true);
      showToast('You are offline. Quick replies available.', 'warning');
    };
    const goOnline = async () => {
      setIsOffline(false);
      showToast('Back online!', 'success');
      // Process any queued offline requests
      const { success } = await processQueue();
      if (success > 0) {
        showToast(`Synced ${success} offline request(s)`, 'info');
      }
    };

    setIsOffline(!navigator.onLine);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [showToast]);

  // ── Handle recorded audio chunks ────────────────────
  const processChunkQueue = useCallback(async () => {
    if (isChunkProcessingRef.current) return;
    if (chunkQueueRef.current.length === 0) return;

    isChunkProcessingRef.current = true;
    setIsProcessing(true);
    setIsRealtimeProcessing(true);

    while (chunkQueueRef.current.length > 0) {
      const item = chunkQueueRef.current.shift();
      if (!item) break;
      const { chunk, segmentEnded, sessionEnded, language } = item;

      if (!chunk && !sessionEnded) {
        continue;
      }

      try {
        const requestStartedAt =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
        const formData = new FormData();

        if (chunk) {
          if (chunk instanceof File) {
            formData.append('file', chunk);
          } else {
            formData.append('file', chunk, 'chunk.webm');
          }
        }

        if (!sessionIdRef.current) {
          sessionIdRef.current =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? (crypto as Crypto).randomUUID()
              : `${Date.now()}-${Math.random()}`;
          previousTranscriptRef.current = '';
          previousSourceLangRef.current = 'en';
          previousTranslatedViRef.current = '';
          previousTranslatedEnRef.current = '';
          setResult(null);
        }

        if (sessionIdRef.current) {
          formData.append('sessionId', sessionIdRef.current);
        }
        formData.append('previousTranscript', previousTranscriptRef.current);
        formData.append('segmentEnded', String(segmentEnded));
        formData.append('sessionEnded', String(sessionEnded));
        formData.append('isCumulativeAudio', 'false');
        formData.append('language', language);
        formData.append('previousSourceLang', previousSourceLangRef.current);
        formData.append('previousTranslatedVi', previousTranslatedViRef.current);
        formData.append('previousTranslatedEn', previousTranslatedEnRef.current);

        const response = await fetch('/api/process-audio', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (isDevRef.current) {
          const requestElapsedMs =
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
            requestStartedAt;
          console.log('[process-chunk] timing', {
            segmentEnded,
            sessionEnded,
            hasChunk: Boolean(chunk),
            requestElapsedMs: Math.round(requestElapsedMs),
          });
        }

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to process audio chunk');
        }

        if (data.no_speech) {
          showDiagnosticToast(
            'audio-no-speech',
            'Fallback audio STT did not detect clear speech in this segment.',
            'warning',
          );
        }

        if (data.data) {
          setResult(data.data);
          const currentTranscript = data.data.transcript?.trim() ?? '';

          // In cumulative-audio mode, keep the latest cumulative transcript snapshot
          if (!sessionEnded && segmentEnded && currentTranscript) {
            previousTranscriptRef.current = currentTranscript;
          }

          if (data.data.source_lang === 'en' || data.data.source_lang === 'vi') {
            previousSourceLangRef.current = data.data.source_lang;
          }

          const prevVi = previousTranslatedViRef.current;
          const prevEn = previousTranslatedEnRef.current;
          const nextVi = data.data.translated_vi ?? '';
          const nextEn = data.data.translated_en ?? '';

          if (segmentEnded && !sessionEnded) {
            if ((data.data.source_lang ?? language) === 'en') {
              const segmentTranslation = extractNewSegment(prevVi, nextVi);
              enqueueTranslatedSegmentSpeech(segmentTranslation, 'vi-VN');
            } else {
              const segmentTranslation = extractNewSegment(prevEn, nextEn);
              enqueueTranslatedSegmentSpeech(segmentTranslation, 'en-US');
            }
          }

          previousTranslatedViRef.current = nextVi;
          previousTranslatedEnRef.current = nextEn;

          if (data.data.is_final && data.data.conversation_id) {
            showToast('Conversation saved', 'success');
          }
          if (sessionEnded) {
            const finalizedSessionId = sessionIdRef.current ?? data.data.session_id ?? null;

            if (finalizedSessionId && !persistedSessionIdsRef.current.has(finalizedSessionId)) {
              persistedSessionIdsRef.current.add(finalizedSessionId);
              void persistTranslationSession({
                sessionId: finalizedSessionId,
                transcript: data.data.transcript,
                source_lang: data.data.source_lang,
                target_lang: data.data.target_lang,
                translated_vi: data.data.translated_vi,
                translated_en: data.data.translated_en,
                reply_en: data.data.reply_en,
                reply_vi: data.data.reply_vi,
              });
            }

            if (!user) {
              saveGuestConversation(data.data);
            }
            showToast('Final session received. Translation completed.', 'success');
            sessionIdRef.current = null;
            previousTranscriptRef.current = '';
            previousSourceLangRef.current = 'en';
            previousTranslatedViRef.current = '';
            previousTranslatedEnRef.current = '';
          }

          // Disabled to avoid covering realtime content after each segment.
          // Re-enable if per-segment completion feedback is needed again.
          // else if (segmentEnded) {
          //   showToast('Segment completed. Waiting for next phrase.', 'info');
          // }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong';
        setError(message);

        if (message.includes('Argos offline translation is unavailable')) {
          showDiagnosticToast(
            'audio-argos-unavailable',
            'Audio fallback STT worked, but Argos translation is unavailable or returned no result.',
            'error',
          );
        } else {
          showDiagnosticToast(
            'audio-stt-failed',
            'Audio fallback STT request failed before translation.',
            'error',
          );
        }

        console.error('[process-audio]', err);
        chunkQueueRef.current = [];
        break;
      }
    }

    setIsProcessing(false);
    setIsRealtimeProcessing(false);
    isChunkProcessingRef.current = false;
  }, [enqueueTranslatedSegmentSpeech, persistTranslationSession, showDiagnosticToast, showToast, user]);

  const handleChunkReady = useCallback(
    async (
      chunk: Blob | null,
      segmentEnded: boolean,
      sessionEnded: boolean,
      language: 'en' | 'vi',
    ) => {
      chunkQueueRef.current.push({ chunk, segmentEnded, sessionEnded, language });
      await processChunkQueue();
    },
    [processChunkQueue],
  );

  const handleTextReady = useCallback(
    async (text: string, sessionEnded: boolean, language: 'en' | 'vi') => {
      const trimmedText = text.trim();
      if (!trimmedText && !sessionEnded) return;

      setIsProcessing(true);
      setIsRealtimeProcessing(true);

      try {
        if (!sessionIdRef.current) {
          sessionIdRef.current =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? (crypto as Crypto).randomUUID()
              : `${Date.now()}-${Math.random()}`;
          previousTranscriptRef.current = '';
          previousSourceLangRef.current = 'en';
          previousTranslatedViRef.current = '';
          previousTranslatedEnRef.current = '';
          setResult(null);
        }

        const response = await fetch('/api/process-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: trimmedText,
            sessionId: sessionIdRef.current,
            previousTranscript: previousTranscriptRef.current,
            language,
            sessionEnded,
            previousSourceLang: previousSourceLangRef.current,
            previousTranslatedVi: previousTranslatedViRef.current,
            previousTranslatedEn: previousTranslatedEnRef.current,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          const code = data?.code ?? 'UNKNOWN';
          const stage = data?.stage ?? 'unknown';
          throw new Error(`${code}|${stage}|${data.error || 'Failed to process text'}`);
        }

        if (data.no_speech) {
          showDiagnosticToast(
            'browser-no-speech',
            'Browser STT did not capture clear speech text yet.',
            'warning',
          );
        }

        if (!data.data) {
          return;
        }

        setResult(data.data);

        const currentTranscript = data.data.transcript?.trim() ?? '';
        if (!sessionEnded && currentTranscript) {
          previousTranscriptRef.current = currentTranscript;
        }

        if (data.data.source_lang === 'en' || data.data.source_lang === 'vi') {
          previousSourceLangRef.current = data.data.source_lang;
        }

        const prevVi = previousTranslatedViRef.current;
        const prevEn = previousTranslatedEnRef.current;
        const nextVi = data.data.translated_vi ?? '';
        const nextEn = data.data.translated_en ?? '';

        if (!sessionEnded) {
          if ((data.data.source_lang ?? language) === 'en') {
            const segmentTranslation = extractNewSegment(prevVi, nextVi);
            enqueueTranslatedSegmentSpeech(segmentTranslation, 'vi-VN');
          } else {
            const segmentTranslation = extractNewSegment(prevEn, nextEn);
            enqueueTranslatedSegmentSpeech(segmentTranslation, 'en-US');
          }
        }

        previousTranslatedViRef.current = nextVi;
        previousTranslatedEnRef.current = nextEn;

        if (sessionEnded) {
          const finalizedSessionId = sessionIdRef.current ?? data.data.session_id ?? null;

          if (finalizedSessionId && !persistedSessionIdsRef.current.has(finalizedSessionId)) {
            persistedSessionIdsRef.current.add(finalizedSessionId);
            void persistTranslationSession({
              sessionId: finalizedSessionId,
              transcript: data.data.transcript,
              source_lang: data.data.source_lang,
              target_lang: data.data.target_lang,
              translated_vi: data.data.translated_vi,
              translated_en: data.data.translated_en,
              reply_en: data.data.reply_en,
              reply_vi: data.data.reply_vi,
            });
          }

          if (!user) {
            saveGuestConversation(data.data);
          }

          showToast('Final session received. Translation completed.', 'success');
          sessionIdRef.current = null;
          previousTranscriptRef.current = '';
          previousSourceLangRef.current = 'en';
          previousTranslatedViRef.current = '';
          previousTranslatedEnRef.current = '';
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong';
        const [code, stage, detail] = message.split('|');
        const isStructured = Boolean(stage && detail);

        if (isStructured) {
          if (code === 'TRANSPORT_TO_STT') {
            showDiagnosticToast(
              'text-transport',
              'Browser STT captured text, but Next cannot reach self-hosted STT/translate service.',
              'error',
            );
          } else if (code === 'STT_TRANSLATE_HTTP_ERROR') {
            showDiagnosticToast(
              'text-stt-http',
              'Request reached self-hosted STT service, but translate endpoint returned an error.',
              'error',
            );
          } else if (code === 'ARGOS_EMPTY_TRANSLATION') {
            showDiagnosticToast(
              'text-argos-empty',
              'Request reached Argos path, but Argos returned empty translation.',
              'error',
            );
          } else if (code === 'CONFIG_MISSING') {
            showDiagnosticToast(
              'text-config-missing',
              'Missing SELF_HOSTED_STT_URL / SELF_HOSTED_TRANSLATE_URL on server config.',
              'error',
            );
          } else {
            showDiagnosticToast(
              'text-unknown',
              `Text translation failed at stage: ${stage}.`,
              'error',
            );
          }
          setError(detail);
        } else {
          setError(message);
          showDiagnosticToast('text-generic-failed', 'Text processing failed before translation.', 'error');
        }

        console.error('[process-text]', err);
      } finally {
        setIsProcessing(false);
        setIsRealtimeProcessing(false);
      }
    },
    [enqueueTranslatedSegmentSpeech, persistTranslationSession, showDiagnosticToast, showToast, user],
  );

  const handleRecorderDiagnostic = useCallback(
    (payload: { source: 'browser-stt' | 'audio-vad'; code: string; detail?: string }) => {
      if (payload.source !== 'browser-stt') return;

      if (payload.code === 'no-speech' || payload.code === 'empty-final-text') {
        showDiagnosticToast(
          'browser-stt-no-speech',
          'Browser STT is active but has not recognized clear speech yet.',
          'warning',
        );
        return;
      }

      if (payload.code === 'fallback-to-audio') {
        showDiagnosticToast(
          'browser-stt-fallback',
          `Browser STT error (${payload.detail ?? 'unknown'}), switching to audio fallback STT.`,
          'warning',
        );
        return;
      }

      if (payload.code === 'fallback-after-restart-limit') {
        showDiagnosticToast(
          'browser-stt-restart-limit',
          'Browser STT stopped repeatedly, switched to audio fallback STT.',
          'warning',
        );
      }
    },
    [showDiagnosticToast],
  );

  // ── Handle quick reply (offline) ─────────────────────
  const handleQuickReply = useCallback((text: string) => {
    setResult({
      transcript: '',
      translated_vi: '',
      reply_en: text,
      reply_vi: '',
    });
  }, []);

  // ── Render ───────────────────────────────────────────
  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-blue-50">
      <Header isOffline={isOffline} />

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-400 hover:text-red-600"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main content area */}
      {isOffline ? (
        <OfflineBanner onSelectReply={handleQuickReply} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ResultBox
            result={result}
            isProcessing={isProcessing}
            isRealtimeProcessing={isRealtimeProcessing}
            autoSpeakEnabled={autoSpeakEnabled}
            onToggleAutoSpeak={handleToggleAutoSpeak}
          />
        </div>
      )}

      {/* File attachment — hidden for now */}
      {/* {!isOffline && (
        <div className="mb-2">
          <FileAttachment
            onFileUploaded={handleFileUploaded}
            disabled={isProcessing}
          />
        </div>
      )} */}

      {/* Record button */}
      <Recorder
        onChunkReady={handleChunkReady}
        onTextReady={handleTextReady}
        onDiagnostic={handleRecorderDiagnostic}
        isProcessing={isProcessing}
        isRealtimeProcessing={isRealtimeProcessing}
        disabled={isOffline}
      />
    </div>
  );
}
