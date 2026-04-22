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

  const playWithServerTTS = useCallback(async (content: string, language: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, voice: 'alloy', lang: language }),
      });

      if (!res.ok) {
        setIsLoading(false);
        return false;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('audio/')) {
        setIsLoading(false);
        return false;
      }

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
      return true;
    } catch {
      setIsLoading(false);
      return false;
    }
  }, []);

  const emergencyBrowserSpeak = useCallback((content: string, language: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsLoading(false);
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    const attemptSpeak = (useDefaultVoice: boolean) => {
      const utterance = new SpeechSynthesisUtterance(content);
      // Some mobile browsers fail silently for vi-VN. Retry with default voice.
      utterance.lang = useDefaultVoice ? '' : language;
      utterance.rate = 0.9;
      utterance.pitch = 1;

      let started = false;
      const timeout = window.setTimeout(() => {
        if (!started && !useDefaultVoice) {
          synth.cancel();
          attemptSpeak(true);
          return;
        }
        setIsPlaying(false);
        setIsLoading(false);
      }, 1400);

      utterance.onstart = () => {
        started = true;
        clearTimeout(timeout);
        setIsPlaying(true);
        setIsLoading(false);
      };
      utterance.onend = () => {
        clearTimeout(timeout);
        setIsPlaying(false);
      };
      utterance.onerror = () => {
        clearTimeout(timeout);
        if (!useDefaultVoice) {
          attemptSpeak(true);
          return;
        }
        setIsPlaying(false);
        setIsLoading(false);
      };

      synth.speak(utterance);
    };

    attemptSpeak(false);
  }, []);

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

  /** Try browser speechSynthesis first, then fall back to server TTS only if needed */
  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      stop();
      return;
    }

    setIsLoading(true);

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      const ok = await playWithServerTTS(text, lang);
      if (!ok) emergencyBrowserSpeak(text, lang);
      return;
    }

    fallbackBrowserTTS(text, lang, async () => {
      const ok = await playWithServerTTS(text, lang);
      if (!ok) emergencyBrowserSpeak(text, lang);
    });
  }, [text, lang, isPlaying, stop, playWithServerTTS, emergencyBrowserSpeak]);

  const fallbackBrowserTTS = (
    text: string,
    lang: string,
    onBrowserFailure: () => void,
  ) => {
    if (!('speechSynthesis' in window)) {
      onBrowserFailure();
      return;
    }

    const synth = speechSynthesis;
    synth.cancel();

    const doSpeak = (voices: SpeechSynthesisVoice[]) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.9;
      utterance.pitch = 1;

      // Explicitly pick a matching voice so Chrome uses the right language
      const normalizedLang = lang.toLowerCase();
      const langPrefix = normalizedLang.split('-')[0];
      const voice =
        voices.find((v) => v.lang.toLowerCase() === normalizedLang) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
        voices.find((v) => v.lang.toLowerCase().includes(langPrefix)) ||
        null;

      if (voice) utterance.voice = voice;

      let started = false;
      const startTimeout = window.setTimeout(() => {
        if (!started) {
          synth.cancel();
          onBrowserFailure();
        }
      }, 1200);

      utterance.onstart = () => {
        started = true;
        clearTimeout(startTimeout);
        setIsPlaying(true);
        setIsLoading(false);
      };
      utterance.onend = () => {
        clearTimeout(startTimeout);
        setIsPlaying(false);
      };
      utterance.onerror = () => {
        clearTimeout(startTimeout);
        setIsPlaying(false);
        setIsLoading(false);
        onBrowserFailure();
      };

      synth.speak(utterance);
    };

    const voices = synth.getVoices();
    if (voices.length > 0) {
      doSpeak(voices);
    } else {
      // Some browsers never fire voiceschanged reliably. Wait briefly, then speak anyway.
      let hasSpoken = false;
      const speakOnce = () => {
        if (hasSpoken) return;
        hasSpoken = true;
        synth.removeEventListener('voiceschanged', onVoicesChanged);
        doSpeak(synth.getVoices());
      };
      const onVoicesChanged = () => {
        clearTimeout(fallbackTimer);
        speakOnce();
      };
      synth.addEventListener('voiceschanged', onVoicesChanged);
      const fallbackTimer = window.setTimeout(speakOnce, 250);
    }
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
      title={isPlaying ? 'Stop playback' : 'Play audio'}
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
