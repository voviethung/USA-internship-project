'use client';

const QUICK_REPLIES = [
  { en: 'Can you repeat that?', vi: 'Bạn có thể nhắc lại được không?' },
  { en: 'Please explain more clearly.', vi: 'Xin hãy giải thích rõ hơn.' },
  {
    en: 'Let me check and get back to you.',
    vi: 'Để tôi kiểm tra và phản hồi lại bạn.',
  },
  { en: 'I understand, thank you.', vi: 'Tôi hiểu rồi, cảm ơn bạn.' },
  {
    en: 'Could you speak more slowly?',
    vi: 'Bạn có thể nói chậm hơn được không?',
  },
];

interface OfflineBannerProps {
  onSelectReply: (text: string) => void;
}

export default function OfflineBanner({ onSelectReply }: OfflineBannerProps) {
  const handleSpeak = (text: string) => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
    onSelectReply(text);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {/* Offline notice */}
      <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
        <p className="text-sm font-medium text-amber-700">
          📡 You&apos;re offline
        </p>
        <p className="text-xs text-amber-600">
          AI features unavailable. Use quick replies below.
        </p>
      </div>

      {/* Quick replies */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
          Quick Replies
        </h3>
        {QUICK_REPLIES.map((reply) => (
          <button
            key={reply.en}
            onClick={() => handleSpeak(reply.en)}
            className="w-full rounded-xl bg-white p-3 text-left shadow-sm transition-colors active:bg-primary-50"
          >
            <p className="text-sm font-medium text-slate-800">{reply.en}</p>
            <p className="mt-0.5 text-xs text-slate-400">{reply.vi}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
