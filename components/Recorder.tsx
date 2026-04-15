'use client';

import { useCallback, useRef, useState } from 'react';

interface RecorderProps {
  onChunkReady: (
    chunk: Blob | null,
    segmentEnded: boolean,
    sessionEnded: boolean,
  ) => void;
  isProcessing: boolean;
  isRealtimeProcessing: boolean;
  disabled: boolean;
}

export default function Recorder({
  onChunkReady,
  isProcessing,
  isRealtimeProcessing,
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const pendingSegmentEndRef = useRef(false);
  const sessionEndRequestedRef = useRef(false);
  const audioCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const file = new File([e.data], `chunk.${mimeType.includes('mp4') ? 'mp4' : mimeType.includes('webm') ? 'webm' : 'wav'}`, {
            type: mimeType,
          });
          const segmentEnded = pendingSegmentEndRef.current || sessionEndRequestedRef.current;
          const sessionEnded = sessionEndRequestedRef.current;
          onChunkReady(file, segmentEnded, sessionEnded);
          pendingSegmentEndRef.current = false;
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all audio tracks
        stream.getTracks().forEach((track) => track.stop());

        // Clear timers and intervals
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (audioCheckIntervalRef.current) {
          clearInterval(audioCheckIntervalRef.current);
          audioCheckIntervalRef.current = null;
        }
        if (chunkTimeoutRef.current) {
          clearTimeout(chunkTimeoutRef.current);
          chunkTimeoutRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        setDuration(0);
      };

      pendingSegmentEndRef.current = false;
      sessionEndRequestedRef.current = false;
      mediaRecorder.start(); // Only flush on pause detection or timeout, not auto every 1s
      setIsRecording(true);

      // Timer for recording duration
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setDuration((Date.now() - startTime) / 1000);
      }, 100);

      // Helper to send chunk data
      const sendChunkData = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.requestData();
        }
      };

      audioCheckIntervalRef.current = setInterval(() => {
        const analyser = analyserRef.current;
        if (!analyser || !mediaRecorderRef.current) return;

        const buffer = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const normalized = (buffer[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / buffer.length);

        const silenceThreshold = 0.01;
        const requiredSilenceMs = 1200;

        if (rms < silenceThreshold) {
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          }
          if (
            silenceStartRef.current &&
            Date.now() - silenceStartRef.current > requiredSilenceMs &&
            !pendingSegmentEndRef.current &&
            !sessionEndRequestedRef.current
          ) {
            pendingSegmentEndRef.current = true;
            sendChunkData();
            // Reset chunk timeout after sending
            if (chunkTimeoutRef.current) {
              clearTimeout(chunkTimeoutRef.current);
            }
            chunkTimeoutRef.current = setTimeout(sendChunkData, 2500);
          }
        } else {
          silenceStartRef.current = null;
        }
      }, 200);

      // Fallback: send chunk every 2.5s if no pause detected
      chunkTimeoutRef.current = setTimeout(() => {
        const scheduleNextChunk = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            sendChunkData();
            chunkTimeoutRef.current = setTimeout(scheduleNextChunk, 2500);
          }
        };
        scheduleNextChunk();
      }, 2500);
    } catch (err) {
      console.error('Microphone error:', err);
      alert(
        'Microphone access denied. Please allow microphone permission in your browser settings.',
      );
    }
  }, [onChunkReady]);

  // ── Stop recording ──────────────────────────────────
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      sessionEndRequestedRef.current = true;
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
