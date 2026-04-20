'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TranslationSession } from '@/lib/types';

export default function TranslationsPage() {
  const [items, setItems] = useState<TranslationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-blue-50">
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

      <div className="flex-1 overflow-y-auto px-4 py-3 pb-20">
        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading translations...</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-slate-500">No translated sessions yet.</div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              const translationText = item.translated_vi || item.translated_en || '—';
              return (
                <div
                  key={item.id}
                  className={`rounded-xl bg-white shadow-sm border transition-all ${
                    isExpanded ? 'border-primary-300 shadow-md' : 'border-slate-100'
                  }`}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm">
                      🌐
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {item.transcript || 'No transcript'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {translationText}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-slate-400">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                      <span
                        className={`inline-block text-xs transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      >
                        ▼
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 py-3 space-y-3">
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
