'use client';

import { useState, useCallback, useRef } from 'react';

interface PlayButtonProps {
  text: string;
  lang?: string;
}

export default function PlayButton({ text, lang = 'en-US' }: PlayButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    speechSynthesis.cancel();
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  /** Try server TTS, fall back to browser speechSynthesis */
  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      stop();
      return;
    }

    setIsLoading(true);

    try {
      // Attempt server-side TTS for higher quality
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'alloy' }),
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';

        // Server returned audio stream
        if (contentType.includes('audio/')) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;

          audio.onplay = () => {
            setIsPlaying(true);
            setIsLoading(false);
          };
          audio.onended = () => {
            setIsPlaying(false);
            URL.revokeObjectURL(url);
            audioRef.current = null;
          };
          audio.onerror = () => {
            setIsPlaying(false);
            setIsLoading(false);
            URL.revokeObjectURL(url);
            audioRef.current = null;
          };

          await audio.play();
          return;
        }
      }
    } catch {
      // Server TTS failed — fall through to browser TTS
    }

    // Fallback: browser speechSynthesis
    fallbackBrowserTTS(text, lang);
  }, [text, lang, isPlaying, stop]);

  const fallbackBrowserTTS = (text: string, lang: string) => {
    if (!('speechSynthesis' in window)) {
      setIsLoading(false);
      return;
    }

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => {
      setIsPlaying(false);
      setIsLoading(false);
    };

    speechSynthesis.speak(utterance);
  };

  return (
    <button
      onClick={handlePlay}
      disabled={isLoading}
      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all ${
        isPlaying
          ? 'bg-primary-600 text-white scale-110'
          : isLoading
          ? 'bg-primary-100 text-primary-400 animate-pulse'
          : 'bg-primary-100 text-primary-600 hover:bg-primary-200 active:scale-95'
      }`}
      aria-label={isPlaying ? 'Stop' : isLoading ? 'Loading...' : 'Play reply'}
      title={isPlaying ? 'Stop playback' : 'Play English reply'}
    >
      {isLoading ? (
        /* Loading spinner */
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : isPlaying ? (
        /* Stop icon */
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      ) : (
        /* Play icon */
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}
