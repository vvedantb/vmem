/**
 * Voice session utilities — mic capture and audio helpers.
 *
 * Pure functions (no React). The VoiceContext orchestrates the
 * full voice pipeline; this module provides the building blocks.
 */

/* ------------------------------------------------------------------ */
/*  Mic recording                                                      */
/* ------------------------------------------------------------------ */

interface RecordingHandle {
  /** Stop recording and return the captured audio blob. */
  stop: () => Promise<Blob>;
  /** Discard the recording without resolving. */
  cancel: () => void;
  /** The underlying MediaRecorder (for state checks). */
  recorder: MediaRecorder;
}

/**
 * Start capturing microphone audio.
 *
 * Returns a handle to stop/cancel the recording. The `stop()` method
 * resolves with a single Blob of the full recording.
 */
export async function startMicRecording(): Promise<RecordingHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16_000,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const chunks: Blob[] = [];
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  const recorder = new MediaRecorder(stream, { mimeType });

  let resolveBlob: ((blob: Blob) => void) | null = null;
  let rejectBlob: ((reason: Error) => void) | null = null;
  let cancelled = false;

  const blobPromise = new Promise<Blob>((resolve, reject) => {
    resolveBlob = resolve;
    rejectBlob = reject;
  });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.onstop = () => {
    // Release all mic tracks
    stream.getTracks().forEach((track) => track.stop());

    if (cancelled) {
      rejectBlob?.(new Error("Recording cancelled"));
      return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    resolveBlob?.(blob);
  };

  recorder.onerror = () => {
    stream.getTracks().forEach((track) => track.stop());
    rejectBlob?.(new Error("MediaRecorder error"));
  };

  recorder.start();

  return {
    stop: () => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
      return blobPromise;
    },
    cancel: () => {
      cancelled = true;
      if (recorder.state === "recording") {
        recorder.stop();
      }
      // Release tracks immediately
      stream.getTracks().forEach((track) => track.stop());
    },
    recorder,
  };
}

/* ------------------------------------------------------------------ */
/*  Audio conversion                                                   */
/* ------------------------------------------------------------------ */

/**
 * Decode an audio Blob into a mono Float32Array at the native sample rate.
 * Useful when the STT pipeline expects raw PCM.
 */
export async function blobToFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16_000 });

  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    return decoded.getChannelData(0);
  } finally {
    await audioCtx.close();
  }
}
