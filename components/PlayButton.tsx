'use client';

import { useState, useCallback } from 'react';

interface PlayButtonProps {
  text: string;
  lang?: string;
}

export default function PlayButton({ text, lang = 'en-US' }: PlayButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = useCallback(() => {
    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in this browser.');
      return;
    }

    // Stop any ongoing speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    speechSynthesis.speak(utterance);
  }, [text, lang]);

  return (
    <button
      onClick={handlePlay}
      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
        isPlaying
          ? 'bg-primary-600 text-white'
          : 'bg-primary-100 text-primary-600 hover:bg-primary-200'
      }`}
      aria-label={isPlaying ? 'Playing' : 'Play reply'}
      title="Play English reply"
    >
      {isPlaying ? (
        /* Speaker active icon */
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
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
