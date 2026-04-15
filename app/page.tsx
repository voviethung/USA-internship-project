'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProcessResult, UploadedFile } from '@/lib/types';
import { createSupabaseBrowser } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { processQueue } from '@/lib/offline-queue';
import Header from '@/components/Header';
import Recorder from '@/components/Recorder';
import ResultBox from '@/components/ResultBox';
import OfflineBanner from '@/components/OfflineBanner';
import FileAttachment from '@/components/FileAttachment';

export default function HomePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRealtimeProcessing, setIsRealtimeProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [attachedFile, setAttachedFile] = useState<UploadedFile | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const previousTranscriptRef = useRef<string>('');
  const chunkQueueRef = useRef<Array<{ chunk: Blob | null; isFinal: boolean }>>([]);
  const isChunkProcessingRef = useRef(false);

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
  }, []);

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
      const { chunk, isFinal } = item;

      if (!chunk && !isFinal) {
        continue;
      }

      try {
        const formData = new FormData();

        if (chunk) {
          formData.append('file', chunk, 'chunk.webm');
        }

        if (!sessionIdRef.current) {
          sessionIdRef.current =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? (crypto as Crypto).randomUUID()
              : `${Date.now()}-${Math.random()}`;
          previousTranscriptRef.current = '';
          setResult(null);
        }

        if (sessionIdRef.current) {
          formData.append('sessionId', sessionIdRef.current);
        }
        formData.append('previousTranscript', previousTranscriptRef.current);
        formData.append('isFinal', String(isFinal));

        const response = await fetch('/api/process-audio', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to process audio chunk');
        }

        if (data.data) {
          setResult(data.data);
          previousTranscriptRef.current = data.data.transcript ?? previousTranscriptRef.current;
          if (data.data.is_final && data.data.conversation_id) {
            showToast('Conversation saved', 'success');
          }
          if (isFinal) {
            showToast('Final chunk received. Translation completed.', 'success');
            sessionIdRef.current = null;
            previousTranscriptRef.current = '';
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong';
        setError(message);
        console.error('[process-audio]', err);
        break;
      }
    }

    setIsProcessing(false);
    setIsRealtimeProcessing(false);
    isChunkProcessingRef.current = false;
  }, [attachedFile, showToast, user]);

  const handleChunkReady = useCallback(
    async (chunk: Blob | null, isFinal: boolean) => {
      chunkQueueRef.current.push({ chunk, isFinal });
      await processChunkQueue();
    },
    [processChunkQueue],
  );

  // ── Handle file attachment ───────────────────────────
  const handleFileUploaded = useCallback((file: UploadedFile) => {
    setAttachedFile(file);
  }, []);

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
        isProcessing={isProcessing}
        isRealtimeProcessing={isRealtimeProcessing}
        disabled={isOffline}
      />
    </div>
  );
}
