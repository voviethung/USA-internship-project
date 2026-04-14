"use client";
import type { ProcessResult } from '@/lib/types';
import PlayButton from './PlayButton';
import LanguageHelper from './LanguageHelper';

interface ResultBoxProps {
  result: ProcessResult | null;
  isProcessing: boolean;
}
function isVietnamese(text: string) {
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
}

export default function ResultBox({ result, isProcessing }: ResultBoxProps) {
  let englishMeaning = null;
  if (result && isVietnamese(result.transcript) && result.reply_en) {
    englishMeaning = (
      <div className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 mt-2">
        <span className="font-semibold">English meaning:</span> {result.reply_en}
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="text-sm text-slate-500">Analyzing your speech…</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="results-scroll space-y-3 px-4 py-4">
        <div className="flex items-center justify-center px-4 py-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
              <svg
                className="h-8 w-8 text-primary-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">
              Hold the microphone button and speak in English
            </p>
            <p className="mt-1 text-xs text-slate-400">
              I&apos;ll translate to Vietnamese and suggest a reply
            </p>
          </div>
        </div>

        {/* Language Helper available even without recording */}
        <LanguageHelper />
      </div>
    );
  }

  return (
    <div className="results-scroll space-y-3 px-4 py-4">
      {/* Transcript Section */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            🎙 Transcript
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            {isVietnamese(result.transcript) ? 'VI' : 'EN'}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-slate-700">
          {result.transcript}
        </p>
        {englishMeaning}
      </section>

      {/* Translation (VI) — only show if transcript is EN */}
      {!isVietnamese(result.transcript) && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              🇻🇳 Translation
            </span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-600">
              VI
            </span>
          </div>
          <p className="text-sm leading-relaxed text-slate-700">
            {result.translated_vi}
          </p>
        </section>
      )}

      {/* Suggested Reply */}
      <section className="rounded-xl border-2 border-primary-100 bg-primary-50/50 p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary-500">
            💬 Suggested Reply
          </span>
        </div>

        {/* English reply + play */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex-1">
            <span className="mb-0.5 block text-[10px] font-medium text-slate-400">
              English
            </span>
            <p className="text-sm font-medium leading-relaxed text-slate-800">
              {result.reply_en}
            </p>
          </div>
          <PlayButton text={result.reply_en} lang="en-US" />
        </div>

        {/* Vietnamese reply */}
        <div>
          <span className="mb-0.5 block text-[10px] font-medium text-slate-400">
            Tiếng Việt
          </span>
          <p className="text-sm leading-relaxed text-slate-600">
            {result.reply_vi}
          </p>
        </div>
      </section>

      {/* Language Helper — type VI→EN or EN grammar check */}
      <LanguageHelper />
    </div>
  );
}
