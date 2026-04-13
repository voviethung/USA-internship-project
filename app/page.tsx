'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [attachedFile, setAttachedFile] = useState<UploadedFile | null>(null);

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

  // ── Handle recorded audio ────────────────────────────
  const handleRecordingComplete = useCallback(async (blob: Blob) => {
    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');

      const response = await fetch('/api/process-audio', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to process audio');
      }

      setResult(data.data);

      // ── Save conversation to Supabase (only if logged in) ──
      if (user && data.data) {
        const supabase = createSupabaseBrowser();
        const { error: saveError } = await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            transcript: data.data.transcript,
            translated_vi: data.data.translated_vi,
            reply_en: data.data.reply_en,
            reply_vi: data.data.reply_vi,
            ai_provider: process.env.NEXT_PUBLIC_AI_PROVIDER || 'groq',
            file_url: attachedFile?.url || null,
            file_name: attachedFile?.fileName || null,
            file_type: attachedFile?.fileType || null,
          });

        if (saveError) {
          console.warn('[save-conversation]', saveError.message);
        } else {
          showToast('Conversation saved', 'success');
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      console.error('[process-audio]', err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

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
        <ResultBox result={result} isProcessing={isProcessing} />
      )}

      {/* File attachment */}
      {!isOffline && (
        <div className="mb-2">
          <FileAttachment
            onFileUploaded={handleFileUploaded}
            disabled={isProcessing}
          />
        </div>
      )}

      {/* Record button */}
      <Recorder
        onRecordingComplete={handleRecordingComplete}
        isProcessing={isProcessing}
        disabled={isOffline}
      />
    </div>
  );
}
