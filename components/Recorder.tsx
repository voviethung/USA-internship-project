'use client';

import { MicVAD } from '@ricky0123/vad-web';
import { useCallback, useEffect, useRef, useState } from 'react';

// â”€â”€ WAV encoder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Converts a Float32Array of PCM samples (16 kHz, mono) to a WAV Blob.
// This is what @ricky0123/vad-web hands us in onSpeechEnd.
function encodeWAV(samples: Float32Array, sampleRate = 16000): Blob {
  const dataLen = samples.length * 2; // 16-bit PCM â†’ 2 bytes per sample
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);

  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  str(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);             // chunk size
  view.setUint16(20, 1, true);              // PCM format
  view.setUint16(22, 1, true);              // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);              // block align
  view.setUint16(34, 16, true);             // bits per sample
  str(36, 'data');
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// â”€â”€ Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface RecorderProps {
  onChunkReady: (
    chunk: Blob | null,
    segmentEnded: boolean,
    sessionEnded: boolean,
    language: 'en' | 'vi',
  ) => void;
  onTextReady?: (text: string, sessionEnded: boolean, language: 'en' | 'vi') => void;
  onDiagnostic?: (payload: {
    source: 'browser-stt' | 'audio-vad';
    code: string;
    detail?: string;
  }) => void;
  isProcessing: boolean;
  isRealtimeProcessing: boolean;
  disabled: boolean;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Recorder({
  onChunkReady,
  onTextReady,
  onDiagnostic,
  isProcessing,
  isRealtimeProcessing,
  disabled,
}: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [duration, setDuration] = useState(0);
  const [language, setLanguage] = useState<'en-US' | 'vi-VN'>('en-US');

  // Keep a ref so callbacks always read the latest language without stale closure
  const languageRef = useRef<'en-US' | 'vi-VN'>('en-US');
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const vadRef = useRef<MicVAD | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startLockRef = useRef(false);
  const sessionEndRequestedRef = useRef(false);
  // Did onSpeechEnd already fire a sessionEnded=true event while stopping?
  const sessionEndDispatchedRef = useRef(false);
  const stopRequestedAtRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const browserTextRef = useRef('');
  const browserInterimRef = useRef('');
  const browserSessionActiveRef = useRef(false);
  const browserRestartAttemptsRef = useRef(0);
  const browserNoSpeechCountRef = useRef(0);
  const [browserSttSupported, setBrowserSttSupported] = useState(false);
  const [useBrowserStt, setUseBrowserStt] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const supported = Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
    setBrowserSttSupported(supported);
    setUseBrowserStt(supported);
  }, []);

  // â”€â”€ Language toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en-US' ? 'vi-VN' : 'en-US'));
  };

  // â”€â”€ Start recording â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const startRecording = useCallback(async () => {
    if (startLockRef.current || isRecording) return;
    startLockRef.current = true;
    setIsStarting(true);
    const lockStartedAt = Date.now();

    try {
      sessionEndRequestedRef.current = false;
      sessionEndDispatchedRef.current = false;

      if (useBrowserStt && onTextReady && typeof window !== 'undefined') {
        const w = window as Window & {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        };
        const RecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;

        if (RecognitionCtor) {
          browserSessionActiveRef.current = true;
          browserTextRef.current = '';
          browserInterimRef.current = '';
          browserRestartAttemptsRef.current = 0;
          browserNoSpeechCountRef.current = 0;

          const startBrowserRecognition = () => {
            const nextRecognition = new RecognitionCtor();
            nextRecognition.lang = languageRef.current;
            nextRecognition.continuous = true;
            nextRecognition.interimResults = true;
            nextRecognition.maxAlternatives = 1;

            nextRecognition.onstart = () => {
              setIsRecording(true);
              setIsSpeaking(false);
            };

            nextRecognition.onresult = (event: SpeechRecognitionEventLike) => {
              let finalChunk = '';
              let interim = '';
              for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result?.[0]?.transcript ?? '';
                if (result?.isFinal) {
                  finalChunk += transcript + ' ';
                } else {
                  interim += transcript;
                }
              }

              if (finalChunk.trim()) {
                // Speech detected — reset all failure counters
                browserRestartAttemptsRef.current = 0;
                browserNoSpeechCountRef.current = 0;
                browserTextRef.current = `${browserTextRef.current} ${finalChunk}`.trim();
                browserInterimRef.current = '';
              } else {
                browserInterimRef.current = interim.trim();
              }

              if (interim.trim()) {
                browserNoSpeechCountRef.current = 0;
              }

              setIsSpeaking(interim.trim().length > 0);
            };

            nextRecognition.onerror = (event) => {
              const errorCode = event?.error ?? 'unknown';
              if (errorCode === 'no-speech') {
                browserNoSpeechCountRef.current += 1;
                browserRestartAttemptsRef.current += 1;
                // Show toast only on first no-speech (page.tsx throttle handles deduplication)
                onDiagnostic?.({
                  source: 'browser-stt',
                  code: 'no-speech',
                  detail: `no-speech (${browserNoSpeechCountRef.current})`,
                });
                // After 3 consecutive no-speech errors, give up and fall back to audio VAD
                if (browserNoSpeechCountRef.current >= 3) {
                  console.warn('[recorder] too many no-speech errors, fallback to VAD');
                  onDiagnostic?.({
                    source: 'browser-stt',
                    code: 'fallback-to-audio',
                    detail: 'no-speech repeated 3 times',
                  });
                  browserSessionActiveRef.current = false;
                  setUseBrowserStt(false);
                  setIsRecording(false);
                  setIsSpeaking(false);
                  if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                  }
                  setDuration(0);
                }
                // Chrome will fire onend next; existing restart logic there handles the rest
                return;
              }

              console.warn('[recorder] browser stt error, fallback to VAD:', errorCode);
              onDiagnostic?.({
                source: 'browser-stt',
                code: 'fallback-to-audio',
                detail: errorCode,
              });
              browserSessionActiveRef.current = false;
              setUseBrowserStt(false);
              setIsRecording(false);
              setIsSpeaking(false);

              if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
              }
              setDuration(0);
            };

            nextRecognition.onend = () => {
              const wasRequested = sessionEndRequestedRef.current;
              recognitionRef.current = null;

              if (wasRequested) {
                browserSessionActiveRef.current = false;
                setIsRecording(false);
                setIsSpeaking(false);

                if (timerRef.current) {
                  clearInterval(timerRef.current);
                  timerRef.current = null;
                }
                setDuration(0);

                const lang = languageRef.current === 'en-US' ? 'en' : 'vi';
                const finalText = `${browserTextRef.current} ${browserInterimRef.current}`.trim();
                if (!finalText) {
                  onDiagnostic?.({
                    source: 'browser-stt',
                    code: 'empty-final-text',
                    detail: 'No final text captured by browser STT.',
                  });
                }
                onTextReady(finalText, true, lang);
                browserTextRef.current = '';
                browserInterimRef.current = '';
                return;
              }

              // Chrome mobile may end recognition early; auto-restart while session is active.
              if (browserSessionActiveRef.current) {
                if (browserRestartAttemptsRef.current >= 3) {
                  console.warn('[recorder] browser stt ended repeatedly, fallback to VAD');
                  onDiagnostic?.({
                    source: 'browser-stt',
                    code: 'fallback-after-restart-limit',
                    detail: 'Browser STT ended repeatedly.',
                  });
                  browserSessionActiveRef.current = false;
                  setUseBrowserStt(false);
                  setIsRecording(false);
                  setIsSpeaking(false);
                  if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                  }
                  setDuration(0);
                  return;
                }

                browserRestartAttemptsRef.current += 1;
                setTimeout(() => {
                  if (browserSessionActiveRef.current && !sessionEndRequestedRef.current) {
                    startBrowserRecognition();
                  }
                }, 150);
              }
            };

            recognitionRef.current = nextRecognition;
            nextRecognition.start();
          };

          startBrowserRecognition();

          const startTime = Date.now();
          timerRef.current = setInterval(() => {
            setDuration((Date.now() - startTime) / 1000);
          }, 100);

          return;
        }
      }

      const myvad = await MicVAD.new({
        // Static assets copied to public/ by scripts/copy-vad-assets.js
        baseAssetPath: '/',
        onnxWASMBasePath: '/',
        // Trigger onSpeechEnd after ~200ms of silence
        redemptionMs: 200,

        onSpeechStart: () => {
          setIsSpeaking(true);
        },

        onSpeechEnd: (audio: Float32Array) => {
          setIsSpeaking(false);
          const lang = languageRef.current === 'en-US' ? 'en' : 'vi';
          const isSessionEnd = sessionEndRequestedRef.current;
          if (isSessionEnd) sessionEndDispatchedRef.current = true;

          const wav = encodeWAV(audio);
          const file = new File([wav], 'segment.wav', { type: 'audio/wav' });
          // segmentEnded is always true here (VAD fired end-of-speech)
          onChunkReady(file, true, isSessionEnd, lang);
        },

        // Misfire = VAD started but audio was too short / too noisy â†’ discard
        onVADMisfire: () => {
          setIsSpeaking(false);
        },
      });

      vadRef.current = myvad;
  await myvad.start();
      setIsRecording(true);

      // Duration counter (cosmetic only)
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setDuration((Date.now() - startTime) / 1000);
      }, 100);
    } catch (err) {
      console.error('VAD / Microphone error:', err);
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.toLowerCase().includes('permission') ||
        message.toLowerCase().includes('denied') ||
        message.toLowerCase().includes('notallowed')
      ) {
        alert(
          'Microphone access denied. Please allow microphone permission in your browser settings.',
        );
      } else {
        alert(`Failed to start voice detection: ${message}`);
      }
    } finally {
      const minStartupLockMs = 1000;
      const elapsed = Date.now() - lockStartedAt;
      const remaining = Math.max(0, minStartupLockMs - elapsed);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log('[recorder] startup timing', {
          elapsedMs: Date.now() - lockStartedAt,
          minStartupLockMs,
        });
      }
      setIsStarting(false);
      startLockRef.current = false;
    }
  }, [isRecording, onChunkReady, onDiagnostic, onTextReady, useBrowserStt]);

  // â”€â”€ Stop recording â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const stopRecording = useCallback(() => {
    stopRequestedAtRef.current = Date.now();
    sessionEndRequestedRef.current = true;
    browserSessionActiveRef.current = false;

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    // destroy() stops the mic stream; if speech was in progress VAD may still
    // fire onSpeechEnd synchronously before fully stopping.
    vadRef.current?.destroy();
    vadRef.current = null;

    setIsRecording(false);
    setIsSpeaking(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDuration(0);

    // Give onSpeechEnd a tick to fire (it's synchronous inside destroy, but
    // React state updates are batched). After that, if it never fired we send
    // a null session-end signal so page.tsx can use the previous transcript.
    setTimeout(() => {
      if (!sessionEndDispatchedRef.current) {
        const lang = languageRef.current === 'en-US' ? 'en' : 'vi';
        onChunkReady(null, false, true, lang);
      }
      if (process.env.NODE_ENV !== 'production' && stopRequestedAtRef.current) {
        console.log('[recorder] stop timing', {
          waitMs: Date.now() - stopRequestedAtRef.current,
          sessionEndDispatched: sessionEndDispatchedRef.current,
        });
      }
      sessionEndDispatchedRef.current = false;
      stopRequestedAtRef.current = null;
    }, 200);
  }, [onChunkReady]);

  // â”€â”€ Format duration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const buttonDisabled = disabled || isStarting;
  const showButtonSpinner = isStarting;
  const stopOnPointerLeave = useBrowserStt ? undefined : stopRecording;

  return (
    <div className="safe-bottom flex flex-col items-center gap-3 pb-6 pt-4">
      {/* Language toggle button */}
      <button
        onClick={toggleLanguage}
        className="mb-2 rounded-full border border-primary-300 bg-white px-4 py-1 text-xs font-semibold text-primary-700 shadow hover:bg-primary-50 transition"
        aria-label="Toggle language"
      >
        {language === 'en-US' ? 'English' : 'Tieng Viet'}
      </button>

      {browserSttSupported && (
        <div className="-mt-1 text-[11px] font-medium text-slate-500">
          {useBrowserStt ? 'Mode: Browser STT (primary)' : 'Mode: Audio STT fallback'}
        </div>
      )}

      {/* Recording status */}
      {isRecording && (
        <span
          className={`text-sm font-mono font-semibold transition-colors ${
            isSpeaking ? 'text-green-500' : 'text-red-500'
          }`}
        >
          {isSpeaking ? 'Speaking...' : `REC ${formatDuration(duration)}`}
        </span>
      )}

      {isStarting && (
        <span className="text-sm text-slate-600 font-medium">
          Preparing microphone<span className="loading-dots"></span>
        </span>
      )}

      {isRealtimeProcessing && (
        <span className="text-sm text-sky-600 font-medium">
          Real-time update<span className="loading-dots"></span>
        </span>
      )}

      {isProcessing && !isRealtimeProcessing && (
        <span className="text-sm text-primary-600 font-medium">
          Processing<span className="loading-dots"></span>
        </span>
      )}

      {/* Record button */}
      <div className="relative">
        {isRecording && <div className="pulse-ring" />}

        <button
          onPointerDown={!buttonDisabled && !isRecording ? startRecording : undefined}
          onPointerUp={isRecording ? stopRecording : undefined}
          onPointerLeave={isRecording ? stopOnPointerLeave : undefined}
          disabled={buttonDisabled}
          className={`record-btn relative z-10 flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition-all
            ${
              isRecording
                ? isSpeaking
                  ? 'bg-green-500 recording scale-110'
                  : 'bg-red-500 recording scale-110'
                : buttonDisabled
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 active:scale-95'
            }`}
          aria-label={isRecording ? 'Release to stop' : 'Hold to speak'}
        >
          {showButtonSpinner ? (
            /* Spinner */
            <svg className="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            /* Mic icon */
            <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </button>
      </div>

      {/* Instruction text */}
      <p className="text-xs text-slate-400">
        {isRecording
          ? language === 'en-US'
            ? 'Release to stop'
            : 'Nha de dung'
          : isStarting
          ? language === 'en-US'
            ? 'Preparing microphone...'
            : 'Dang khoi tao micro...'
          : isProcessing
          ? language === 'en-US'
            ? 'Analyzing audio...'
            : 'Dang phan tich am thanh...'
          : language === 'en-US'
          ? 'Hold to speak'
          : 'Nhan giu de noi'}
      </p>
    </div>
  );
}
