'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TranslationSession } from '@/lib/types';
import LanguageHelper from '@/components/LanguageHelper';

export default function TranslationsPage() {
  const [items, setItems] = useState<TranslationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingReplyById, setLoadingReplyById] = useState<Record<string, boolean>>({});
  const [loadingSummaryById, setLoadingSummaryById] = useState<Record<string, boolean>>({});
  const [summaryById, setSummaryById] = useState<
    Record<string, { summary_en: string; summary_vi: string }>
  >({});

  const fetchTranslations = useCallback(async () => {
    try {
      const response = await fetch('/api/translations-public', {
        method: 'GET',
        cache: 'no-store',
      });
      const json = await response.json();

      if (!response.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to fetch translations');
      }

      setItems(json.data || []);
    } catch (err) {
      console.error('[translations] Fetch error:', err);
      setItems([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTranslations();
  }, [fetchTranslations]);

  const handleGenerateReply = useCallback(async (translationId: string) => {
    setLoadingReplyById((prev) => ({ ...prev, [translationId]: true }));
    try {
      const response = await fetch('/api/translations-suggested-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ translationId }),
      });
      const json = await response.json();

      if (!response.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to generate suggested reply');
      }

      const replyEn = json?.data?.reply_en ?? '';
      const replyVi = json?.data?.reply_vi ?? '';
      setItems((prev) =>
        prev.map((item) =>
          item.id === translationId
            ? {
                ...item,
                reply_en: replyEn,
                reply_vi: replyVi,
              }
            : item,
        ),
      );
    } catch (err) {
      console.error('[translations] Generate reply error:', err);
    } finally {
      setLoadingReplyById((prev) => ({ ...prev, [translationId]: false }));
    }
  }, []);

  const handleGenerateSummary = useCallback(async (translationId: string) => {
    setLoadingSummaryById((prev) => ({ ...prev, [translationId]: true }));
    try {
      const response = await fetch('/api/translations-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ translationId }),
      });
      const json = await response.json();

      if (!response.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to generate summary');
      }

      setSummaryById((prev) => ({
        ...prev,
        [translationId]: {
          summary_en: json?.data?.summary_en ?? '',
          summary_vi: json?.data?.summary_vi ?? '',
        },
      }));
    } catch (err) {
      console.error('[translations] Generate summary error:', err);
    } finally {
      setLoadingSummaryById((prev) => ({ ...prev, [translationId]: false }));
    }
  }, []);

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-blue-50">
      <header className="safe-top bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">Translations</h1>
            <p className="text-[10px] uppercase tracking-wider text-blue-200">
              {items.length} session{items.length !== 1 ? 's' : ''}
            </p>
          </div>
          <span className="text-2xl">🌐</span>
        </div>
      </header>

      <div className="results-scroll min-h-0 flex-1 overflow-y-scroll px-4 py-3 pb-20">
        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading translations...</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-slate-500">No translated sessions yet.</div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              const translationText = item.translated_vi || item.translated_en || '—';
              const hasReply = Boolean(item.reply_en || item.reply_vi);
              const isGeneratingReply = Boolean(loadingReplyById[item.id]);
              const summary = summaryById[item.id];
              const hasSummary = Boolean(summary?.summary_en || summary?.summary_vi);
              const isGeneratingSummary = Boolean(loadingSummaryById[item.id]);
              return (
                <div
                  key={item.id}
                  className={`rounded-xl bg-white shadow-sm border transition-all ${
                    isExpanded ? 'border-primary-300 shadow-md' : 'border-slate-100'
                  }`}
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm">
                      🌐
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium text-slate-700">
                        {item.transcript || 'No transcript'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {translationText}
                      </p>
                    </button>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-slate-400">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleGenerateSummary(item.id)}
                          disabled={isGeneratingSummary}
                          className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {isGeneratingSummary ? '...' : hasSummary ? 'Summary ✓' : 'Summary'}
                        </button>
                        <button
                          onClick={() => handleGenerateReply(item.id)}
                          disabled={isGeneratingReply}
                          className="rounded-md bg-primary-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                        >
                          {isGeneratingReply ? '...' : hasReply ? 'Reply ✓' : 'Suggested reply'}
                        </button>
                      </div>
                      <span
                        className={`ml-1 inline-block text-xs transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      >
                        ▼
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-500">
                        Suggested Reply
                      </p>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Transcript
                        </p>
                        <p className="mt-1 text-sm text-slate-700">{item.transcript}</p>
                      </div>

                      {!!item.translated_vi && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Translation (VI)
                          </p>
                          <p className="mt-1 text-sm text-slate-700">{item.translated_vi}</p>
                        </div>
                      )}

                      {!!item.translated_en && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Translation (EN)
                          </p>
                          <p className="mt-1 text-sm text-slate-700">{item.translated_en}</p>
                        </div>
                      )}

                      {!!summary?.summary_en && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Summary (EN)
                          </p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{summary.summary_en}</p>
                        </div>
                      )}

                      {!!summary?.summary_vi && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Summary (VI)
                          </p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{summary.summary_vi}</p>
                        </div>
                      )}

                      {!!item.reply_en && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Suggested Reply (EN)
                          </p>
                          <p className="mt-1 text-sm text-slate-700">{item.reply_en}</p>
                        </div>
                      )}

                      {!!item.reply_vi && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Suggested Reply (VI)
                          </p>
                          <p className="mt-1 text-sm text-slate-700">{item.reply_vi}</p>
                        </div>
                      )}

                      {!hasReply && !isGeneratingReply && (
                        <p className="text-xs text-slate-500 italic">
                          Tap "Suggested reply" to generate a reply for this session.
                        </p>
                      )}

                      {!hasSummary && !isGeneratingSummary && (
                        <p className="text-xs text-slate-500 italic">
                          Tap "Summary" to summarize key points of this session.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Language Helper in Translation tab */}
        <LanguageHelper />
      </div>
    </div>
  );
}
