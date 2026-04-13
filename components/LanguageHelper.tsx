'use client';

import { useState, useCallback, useRef } from 'react';
import PlayButton from './PlayButton';

// ── Types ───────────────────────────────────────────────────

interface ViToEnResult {
  mode: 'vi_to_en';
  translation: string;
  notes: string;
}

interface Suggestion {
  type: 'grammar' | 'vocabulary' | 'style';
  original: string;
  suggestion: string;
  explanation: string;
}

interface EnHelperResult {
  mode: 'en_helper';
  corrected: string;
  is_correct: boolean;
  suggestions: Suggestion[];
}

type HelperResult = ViToEnResult | EnHelperResult;

// ── Detect language ─────────────────────────────────────────

function isVietnamese(text: string): boolean {
  const viRegex =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  return viRegex.test(text);
}

// ── Badge colors by suggestion type ─────────────────────────

const TYPE_STYLES: Record<string, string> = {
  grammar: 'bg-red-100 text-red-700',
  vocabulary: 'bg-blue-100 text-blue-700',
  style: 'bg-purple-100 text-purple-700',
};

const TYPE_LABELS: Record<string, string> = {
  grammar: 'Ngữ pháp',
  vocabulary: 'Từ vựng',
  style: 'Văn phong',
};

// ── Component ───────────────────────────────────────────────

export default function LanguageHelper() {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<HelperResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const detectedLang = inputText.trim()
    ? isVietnamese(inputText)
      ? 'vi'
      : 'en'
    : null;

  // ── Submit text to API ────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/language-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to process text');
      }

      setResult(data.data as HelperResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [inputText]);

  // ── Handle Enter key ──────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── Clear ─────────────────────────────────────────────

  const handleClear = () => {
    setInputText('');
    setResult(null);
    setError(null);
  };

  // ── Render ────────────────────────────────────────────

  return (
    <section className="rounded-xl border-2 border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
          ✍️ Language Helper
        </span>
        {detectedLang && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              detectedLang === 'vi'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {detectedLang === 'vi' ? 'VI → EN' : 'EN Check'}
          </span>
        )}
      </div>

      {/* Input area */}
      <div className="relative mb-3">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Gõ tiếng Việt để dịch sang Anh, hoặc gõ tiếng Anh để kiểm tra ngữ pháp..."
          className="w-full resize-none rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          rows={2}
          disabled={isLoading}
        />
        {inputText && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-2 text-slate-300 hover:text-slate-500 transition-colors"
            aria-label="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={isLoading || !inputText.trim()}
        className="mb-3 w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Processing…
          </span>
        ) : detectedLang === 'vi' ? (
          '🔄 Dịch sang tiếng Anh'
        ) : (
          '🔍 Kiểm tra ngữ pháp & từ vựng'
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* ── Result: Vietnamese → English ─────────────── */}
      {result?.mode === 'vi_to_en' && (
        <div className="space-y-2 animate-fadeIn">
          {/* Translation */}
          <div className="rounded-lg bg-white p-3 shadow-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
                  🇺🇸 English Translation
                </span>
              </div>
              <PlayButton text={result.translation} lang="en-US" />
            </div>
            <p className="text-sm font-medium leading-relaxed text-slate-800">
              {result.translation}
            </p>
          </div>

          {/* Notes (if any) */}
          {result.notes && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                📝 Note
              </span>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                {result.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Result: English Helper ────────────────────── */}
      {result?.mode === 'en_helper' && (
        <div className="space-y-2 animate-fadeIn">
          {/* Corrected text */}
          <div className="rounded-lg bg-white p-3 shadow-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">
                  {result.is_correct ? '✅ Correct' : '✏️ Corrected'}
                </span>
              </div>
              <PlayButton text={result.corrected} lang="en-US" />
            </div>
            <p className="text-sm font-medium leading-relaxed text-slate-800">
              {result.corrected}
            </p>
          </div>

          {/* Suggestions */}
          {result.suggestions && result.suggestions.length > 0 && (
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                💡 Gợi ý cải thiện
              </span>
              <div className="space-y-2.5">
                {result.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        TYPE_STYLES[s.type] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {TYPE_LABELS[s.type] || s.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-700">
                        <span className="line-through text-red-400">{s.original}</span>
                        {' → '}
                        <span className="font-semibold text-emerald-600">{s.suggestion}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {s.explanation}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All correct message */}
          {result.is_correct && (!result.suggestions || result.suggestions.length === 0) && (
            <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-center">
              <p className="text-xs text-green-700">
                🎉 Câu của bạn đã đúng ngữ pháp! Tuyệt vời!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Hint */}
      {!result && !isLoading && !error && (
        <p className="text-center text-[11px] text-slate-400">
          Enter gửi • Shift+Enter xuống dòng
        </p>
      )}
    </section>
  );
}
