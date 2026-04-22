"use client";
import type { ProcessResult } from '@/lib/types';
import LanguageHelper from './LanguageHelper';

interface ResultBoxProps {
  result: ProcessResult | null;
  isProcessing: boolean;
  isRealtimeProcessing: boolean;
  autoSpeakEnabled: boolean;
  onToggleAutoSpeak: () => void;
}
function isVietnamese(text: string) {
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
}

export default function ResultBox({
  result,
  isProcessing,
  isRealtimeProcessing,
  autoSpeakEnabled,
  onToggleAutoSpeak,
}: ResultBoxProps) {
  const sourceLang =
    result?.source_lang ??
    (result && isVietnamese(result.transcript) ? 'vi' : 'en');
  const translation =
    sourceLang === 'vi' ? result?.translated_en : result?.translated_vi;
  const translationLabel = sourceLang === 'vi' ? '🇬🇧 Translation' : '🇻🇳 Translation';
  const translationTag = sourceLang === 'vi' ? 'EN' : 'VI';

  if (isProcessing && !result) {
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
              I&apos;ll translate your speech. Suggested reply is now in Translation tab.
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
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            🎙 Transcript
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            {sourceLang === 'vi' ? 'VI' : 'EN'}
          </span>
          {result.is_final === false && (
            <span className="rounded bg-yellow-50 text-yellow-700 px-1.5 py-0.5 text-[10px] font-medium">
              Partial result
            </span>
          )}
          {result.is_final === true && (
            <span className="rounded bg-green-50 text-green-700 px-1.5 py-0.5 text-[10px] font-medium">
              Final result
            </span>
          )}
          {isRealtimeProcessing && (
            <span className="rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 text-[10px] font-medium">
              Realtime updating
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-slate-700">
          {result.transcript}
        </p>
        {result.is_final === false && (
          <p className="mt-2 text-xs text-slate-500">
            Waiting for the final chunk to finalize translation. This result is partial and may update.
          </p>
        )}
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {translationLabel}
            </span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-600">
              {translationTag}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleAutoSpeak}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition ${
              autoSpeakEnabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
            }`}
            aria-pressed={autoSpeakEnabled}
            aria-label={
              autoSpeakEnabled
                ? 'Turn off auto speak for translated segments'
                : 'Turn on auto speak for translated segments'
            }
            title={
              autoSpeakEnabled
                ? 'Auto speak is on for each translated segment'
                : 'Auto speak is off'
            }
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {autoSpeakEnabled ? (
                <path d="M14.5 3.5a1 1 0 011.414 0L20.5 8.086a1 1 0 010 1.414L15.914 14.086A1 1 0 0114.207 13.5V11H10a1 1 0 01-1-1V8a1 1 0 011-1h4.207V4.5a1 1 0 01.293-.707zM6 8a1 1 0 000 2h1a1 1 0 000-2H6zm0 4a1 1 0 100 2h2a1 1 0 100-2H6zm11.657 3.243a1 1 0 011.414 0A5.96 5.96 0 0021 11a5.96 5.96 0 00-1.929-4.243 1 1 0 011.414-1.414A7.95 7.95 0 0123 11a7.95 7.95 0 01-2.515 5.657 1 1 0 01-1.414-1.414z" />
              ) : (
                <path d="M15.5 3.5a1 1 0 00-1.707.707V7H10a1 1 0 00-1 1v2a1 1 0 001 1h3.793v2.793a1 1 0 001.707.707l2.292-2.292-1.414-1.414-1.086 1.086V8.12l4.086 4.086 1.414-1.414-5.292-5.292zM4.293 4.293a1 1 0 011.414 0L20.707 19.293a1 1 0 01-1.414 1.414l-3.34-3.34-1.047 1.047A1 1 0 0113.207 18.5V16H10a1 1 0 01-1-1v-2a1 1 0 011-1h2.793L2.879 2.879a1 1 0 011.414-1.414z" />
              )}
            </svg>
            {autoSpeakEnabled ? 'Auto voice on' : 'Auto voice off'}
          </button>
        </div>
        {translation ? (
          <p className="text-sm leading-relaxed text-slate-700">{translation}</p>
        ) : (
          <p className="text-sm text-slate-400 italic">
            Translation is being generated... Please continue speaking or end the segment.
          </p>
        )}
      </section>

      {/* Language Helper — type VI→EN or EN grammar check */}
      <LanguageHelper />
    </div>
  );
}
