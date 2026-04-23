'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PlayButton from '@/components/PlayButton';
import type { TemplateLine, TemplateSection } from '@/lib/types';

function languageToVoice(lang: 'en' | 'vi') {
  return lang === 'vi' ? 'vi-VN' : 'en-US';
}

function kindBadgeClass(kind: TemplateLine['line_kind']) {
  switch (kind) {
    case 'note':
      return 'bg-amber-100 text-amber-700';
    case 'practice':
      return 'bg-emerald-100 text-emerald-700';
    case 'instructor':
      return 'bg-blue-100 text-blue-700';
    case 'student':
      return 'bg-violet-100 text-violet-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function sectionIcon(type: TemplateSection['section_type']) {
  switch (type) {
    case 'overview':
      return '🧭';
    case 'usage':
      return '🎧';
    case 'track':
      return '🎤';
    case 'roleplay':
      return '🎭';
    case 'master_phrase':
      return '🔥';
    case 'practice':
      return '🎯';
    case 'scenario':
      return '🧪';
    default:
      return '📘';
  }
}

export default function TemplatePage() {
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTemplate = useCallback(async () => {
    try {
      const response = await fetch('/api/templates-public', {
        method: 'GET',
        cache: 'no-store',
      });
      const json = await response.json();

      if (!response.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to fetch template');
      }

      setSections(json.data || []);
      if ((json.data || []).length > 0) {
        setExpandedId(json.data[0].id);
      }
    } catch (err) {
      console.error('[template] Fetch error:', err);
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  const groupedByWeek = useMemo(() => {
    const map = new Map<string, TemplateSection[]>();
    for (const section of sections) {
      const key =
        section.week_no === null
          ? 'General'
          : `Week ${section.week_no}`;
      const bucket = map.get(key) ?? [];
      bucket.push(section);
      map.set(key, bucket);
    }
    return Array.from(map.entries());
  }, [sections]);

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-blue-50">
      <header className="safe-top bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">Template Practice</h1>
            <p className="text-[10px] uppercase tracking-wider text-blue-200">
              {sections.length} section{sections.length !== 1 ? 's' : ''}
            </p>
          </div>
          <span className="text-2xl">🧩</span>
        </div>
      </header>

      <div className="results-scroll min-h-0 flex-1 overflow-y-scroll px-4 py-3 pb-20">
        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading template...</div>
        ) : sections.length === 0 ? (
          <div className="py-10 text-center text-slate-500">No template data found.</div>
        ) : (
          <div className="space-y-4">
            {groupedByWeek.map(([weekLabel, weekSections]) => (
              <section key={weekLabel} className="space-y-3">
                <div className="sticky top-0 z-10 rounded-lg bg-blue-100/95 px-3 py-2 text-xs font-semibold text-blue-700 backdrop-blur">
                  {weekLabel}
                </div>

                {weekSections.map((section) => {
                  const isExpanded = expandedId === section.id;
                  return (
                    <article
                      key={section.id}
                      className={`rounded-xl border bg-white shadow-sm transition-all ${
                        isExpanded ? 'border-primary-300 shadow-md' : 'border-slate-100'
                      }`}
                    >
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : section.id)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm">
                          {sectionIcon(section.section_type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-700">{section.title}</p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {section.lines.length} line{section.lines.length !== 1 ? 's' : ''}
                            {section.track_no ? ` • Track ${section.track_no}` : ''}
                          </p>
                        </div>
                        <span
                          className={`text-xs text-slate-400 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        >
                          ▼
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="space-y-2 border-t border-slate-100 px-4 py-3">
                          {section.notes && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              {section.notes}
                            </div>
                          )}

                          {Array.from(
                            section.lines.reduce((map, line) => {
                              const bucket = map.get(line.line_no) ?? { en: null as TemplateLine | null, vi: null as TemplateLine | null, extra: [] as TemplateLine[] };
                              if (line.language_code === 'en') bucket.en = line;
                              else if (line.language_code === 'vi') bucket.vi = line;
                              else bucket.extra.push(line);
                              map.set(line.line_no, bucket);
                              return map;
                            }, new Map<number, { en: TemplateLine | null; vi: TemplateLine | null; extra: TemplateLine[] }>()),
                          )
                            .sort((a, b) => a[0] - b[0])
                            .map(([lineNo, pair]) => {
                              const primary = pair.en ?? pair.vi;
                              if (!primary) return null;

                              return (
                                <div
                                  key={lineNo}
                                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                                >
                                  <div className="mb-1 flex items-center gap-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${kindBadgeClass(primary.line_kind)}`}
                                    >
                                      {primary.line_kind.toUpperCase()}
                                    </span>
                                    {primary.role_label && (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                        {primary.role_label}
                                      </span>
                                    )}
                                  </div>

                                  {pair.en && (
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">EN</p>
                                        <p className="whitespace-pre-wrap text-sm text-slate-700">{pair.en.text_content}</p>
                                      </div>
                                      <PlayButton text={pair.en.text_content} lang="en-US" />
                                    </div>
                                  )}

                                  {pair.vi && (
                                    <div className="flex items-start justify-between gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">VI</p>
                                        <p className="whitespace-pre-wrap text-sm text-emerald-800">{pair.vi.text_content}</p>
                                      </div>
                                      <PlayButton text={pair.vi.text_content} lang="vi-VN" />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
