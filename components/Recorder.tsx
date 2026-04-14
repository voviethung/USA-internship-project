'use client';

import { useCallback, useRef, useState } from 'react';
import { compressAudio } from '@/lib/audio-utils';

interface RecorderProps {
  onRecordingComplete: (blob: Blob, language: 'en-US' | 'vi-VN') => void;
  isProcessing: boolean;
  disabled: boolean;
}

export default function Recorder({
  onRecordingComplete,
  isProcessing,
  disabled,
}: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [language, setLanguage] = useState<'en-US' | 'vi-VN'>('en-US');
    // ── Language toggle handler ─────────────────────────
    const toggleLanguage = () => {
      setLanguage((prev) => (prev === 'en-US' ? 'vi-VN' : 'en-US'));
    };
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Determine supported MIME type ───────────────────
  const getMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
      return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    return 'audio/webm';
  };

  // ── Start recording ─────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      const mimeType = getMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop all audio tracks
        stream.getTracks().forEach((track) => track.stop());

        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // Build the blob
        const blob = new Blob(chunksRef.current, { type: mimeType });

        // Only send if we got some audio data
        if (chunksRef.current.length > 0) {
          // Compress audio for smaller upload (16kHz mono WAV)
          const compressed = await compressAudio(blob);

          // Create a File with proper extension for Whisper API
          const isWav = compressed.type === 'audio/wav';
          const ext = isWav ? 'wav' : mimeType.includes('mp4') ? 'mp4' : 'webm';
          const file = new File([compressed], `recording.${ext}`, {
            type: isWav ? 'audio/wav' : mimeType,
          });
          onRecordingComplete(file as unknown as Blob, language);
        }

        setDuration(0);
      };

      mediaRecorder.start(250); // collect data every 250ms
      setIsRecording(true);

      // Timer for recording duration
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setDuration((Date.now() - startTime) / 1000);
      }, 100);
    } catch (err) {
      console.error('Microphone error:', err);
      alert(
        'Microphone access denied. Please allow microphone permission in your browser settings.',
      );
    }
  }, [onRecordingComplete]);

  // ── Stop recording ──────────────────────────────────
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // ── Format duration ─────────────────────────────────
  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Render ──────────────────────────────────────────
  const buttonDisabled = disabled || isProcessing;

  return (
    <div className="safe-bottom flex flex-col items-center gap-3 pb-6 pt-4">
      {/* Language toggle button */}
      <button
        onClick={toggleLanguage}
        className="mb-2 rounded-full border border-primary-300 bg-white px-4 py-1 text-xs font-semibold text-primary-700 shadow hover:bg-primary-50 transition"
        aria-label="Toggle language"
      >
        {language === 'en-US' ? '🇺🇸 English' : '🇻🇳 Tiếng Việt'}
      </button>
      {/* Duration display */}
      {isRecording && (
        <span className="text-sm font-mono text-red-500 font-semibold">
          ● REC {formatDuration(duration)}
        </span>
      )}

      {isProcessing && (
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
          onPointerLeave={isRecording ? stopRecording : undefined}
          disabled={buttonDisabled}
          className={`record-btn relative z-10 flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition-all
            ${
              isRecording
                ? 'bg-red-500 recording scale-110'
                : buttonDisabled
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 active:scale-95'
            }`}
          aria-label={isRecording ? 'Release to stop' : 'Hold to speak'}
        >
          {isProcessing ? (
            /* Spinner */
            <svg
              className="h-8 w-8 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
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
            <svg
              className="h-8 w-8"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
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
            : 'Nhả để dừng'
          : isProcessing
          ? language === 'en-US'
            ? 'Analyzing audio…'
            : 'Đang phân tích âm thanh…'
          : language === 'en-US'
            ? 'Hold to speak'
            : 'Nhấn giữ để nói'}
      </p>
    </div>
  );
}
