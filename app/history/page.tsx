'use client';

import { useEffect, useState, useCallback } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { SkeletonHistoryList } from '@/components/Skeleton';
import type { Conversation } from '@/lib/types';
import PlayButton from '@/components/PlayButton';

export default function HistoryPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch conversations ──────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!user) return;

    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[history] Fetch error:', error.message);
    } else {
      setConversations(data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // ── Delete conversation ──────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this conversation?')) return;

    setDeletingId(id);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[history] Delete error:', error.message);
      showToast('Failed to delete', 'error');
    } else {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (expandedId === id) setExpandedId(null);
      showToast('Conversation deleted', 'success');
    }
    setDeletingId(null);
  };

  // ── Format date ──────────────────────────────────────
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) {
      const mins = Math.floor(diffMs / (1000 * 60));
      return `${mins}m ago`;
    }
    if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    }
    if (diffHours < 48) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-blue-50">
      {/* Header */}
      <header className="safe-top bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">History</h1>
            <p className="text-[10px] uppercase tracking-wider text-blue-200">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </p>
          </div>
          <span className="text-2xl">📋</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-20">
        {loading ? (
          <SkeletonHistoryList />
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="mb-3 text-5xl">🎙️</span>
            <h2 className="text-lg font-semibold text-slate-600">No conversations yet</h2>
            <p className="mt-1 text-sm text-slate-400">
              Start recording on the Home page to see your history here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conv) => {
              const isExpanded = expandedId === conv.id;
              const isDeleting = deletingId === conv.id;

              return (
                <div
                  key={conv.id}
                  className={`rounded-xl bg-white shadow-sm border transition-all ${
                    isExpanded ? 'border-primary-300 shadow-md' : 'border-slate-100'
                  }`}
                >
                  {/* Summary row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : conv.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm">
                      🎤
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {conv.transcript || 'No transcript'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {conv.translated_vi || '—'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-slate-400">
                        {formatDate(conv.created_at)}
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

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                      {/* Transcript */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Transcript (EN)
                        </p>
                        <p className="mt-1 text-sm text-slate-700">{conv.transcript}</p>
                      </div>

                      {/* Translation */}
                      {conv.translated_vi && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Translation (VI)
                          </p>
                          <p className="mt-1 text-sm text-slate-700">{conv.translated_vi}</p>
                        </div>
                      )}

                      {/* Suggested Reply EN */}
                      {conv.reply_en && (
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              Suggested Reply (EN)
                            </p>
                            <PlayButton text={conv.reply_en} />
                          </div>
                          <p className="mt-1 text-sm text-slate-700">{conv.reply_en}</p>
                        </div>
                      )}

                      {/* Suggested Reply VI */}
                      {conv.reply_vi && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Reply (VI)
                          </p>
                          <p className="mt-1 text-sm text-slate-600 italic">{conv.reply_vi}</p>
                        </div>
                      )}

                      {/* Attached file */}
                      {conv.file_url && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Attachment
                          </p>
                          <a
                            href={conv.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                          >
                            📎 {conv.file_name || 'View file'}
                          </a>
                        </div>
                      )}

                      {/* Metadata + Delete */}
                      <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                        <span className="text-[10px] text-slate-400">
                          {conv.ai_provider.toUpperCase()} •{' '}
                          {new Date(conv.created_at).toLocaleString()}
                        </span>
                        <button
                          onClick={() => handleDelete(conv.id)}
                          disabled={isDeleting}
                          className="rounded-md px-3 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          {isDeleting ? 'Deleting...' : '🗑️ Delete'}
                        </button>
                      </div>
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
