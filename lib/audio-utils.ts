/**
 * Audio compression utilities.
 * Downsamples and compresses audio for smaller upload sizes.
 */

/**
 * Compress an audio blob using Web Audio API.
 * Downsamples to 16kHz mono WAV — optimal for Whisper STT.
 *
 * Falls back to the original blob if compression fails.
 */
export async function compressAudio(blob: Blob): Promise<Blob> {
  try {
    // Decode the original audio
    const arrayBuffer = await blob.arrayBuffer();
    const audioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audioContextCtor) {
      return blob;
    }
    const audioCtx = new audioContextCtor();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Target: 16kHz mono (Whisper optimal)
    const targetSampleRate = 16000;
    const numChannels = 1;

    // Create an offline context for resampling
    const offlineCtx = new OfflineAudioContext(
      numChannels,
      Math.ceil(audioBuffer.duration * targetSampleRate),
      targetSampleRate,
    );

    // Create source from the original buffer
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    // Render the resampled audio
    const renderedBuffer = await offlineCtx.startRendering();

    // Convert to WAV format
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioCtx.close();

    // Only use compressed version if it's actually smaller
    if (wavBlob.size < blob.size) {
      console.log(
        `[audio-compress] ${formatSize(blob.size)} → ${formatSize(wavBlob.size)} (${Math.round((1 - wavBlob.size / blob.size) * 100)}% reduction)`,
      );
      return wavBlob;
    }

    return blob;
  } catch (err) {
    console.warn('[audio-compress] Compression failed, using original:', err);
    return blob;
  }
}

/**
 * Convert an AudioBuffer to a WAV Blob.
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  // Interleave channels
  const length = buffer.length * numChannels;
  const samples = new Int16Array(length);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++) {
      // Clamp to [-1, 1] and convert to 16-bit PCM
      const s = Math.max(-1, Math.min(1, channelData[i]));
      samples[i * numChannels + channel] =
        s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }

  // Build WAV file
  const dataLength = samples.length * (bitDepth / 8);
  const headerLength = 44;
  const wavBuffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(wavBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write PCM samples
  const output = new Int16Array(wavBuffer, headerLength);
  output.set(samples);

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Estimate the duration of an audio blob (approximate).
 */
export async function estimateAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';

    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(duration) ? duration : 0);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };

    audio.src = url;
  });
}
