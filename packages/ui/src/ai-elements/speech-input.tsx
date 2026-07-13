"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { IconLoader2, IconMicrophone, IconSquare } from "@tabler/icons-react";
import { Button } from "../ui/button";
import { cn } from "../utils/cn";

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null;
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
    | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

type SpeechInputMode = "speech-recognition" | "media-recorder" | "none";

export type SpeechInputProps = ComponentProps<typeof Button> & {
  onTranscriptionChange?: (text: string) => void;
  onAudioRecorded?: (audioBlob: Blob) => Promise<string>;
  lang?: string;
};

const detectSpeechInputMode = (): SpeechInputMode => {
  if (typeof window === "undefined") return "none";
  if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    return "speech-recognition";
  if ("MediaRecorder" in window && "mediaDevices" in navigator)
    return "media-recorder";
  return "none";
};

type SpeechInputState = "idle" | "listening" | "processing";

export function SpeechInput({
  onTranscriptionChange,
  onAudioRecorded,
  lang = "en-US",
  className,
  ...props
}: SpeechInputProps) {
  const [state, setState] = useState<SpeechInputState>("idle");
  const [mode, setMode] = useState<SpeechInputMode>("none");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setMode(detectSpeechInputMode());
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setState("idle");
  }, []);

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setState("listening");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Interim results are ignored — only final transcripts are emitted.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal && result[0]) {
          onTranscriptionChange?.(result[0].transcript);
        }
      }
    };

    recognition.onerror = () => {
      stopSpeechRecognition();
    };

    recognition.onend = () => {
      setState("idle");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [lang, onTranscriptionChange, stopSpeechRecognition]);

  const stopMediaRecorder = useCallback(async () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
  }, []);

  const startMediaRecorder = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
      chunksRef.current = [];

      if (onAudioRecorded) {
        setState("processing");
        try {
          const text = await onAudioRecorded(audioBlob);
          onTranscriptionChange?.(text);
        } finally {
          setState("idle");
        }
      } else {
        setState("idle");
      }
      mediaRecorderRef.current = null;
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setState("listening");
  }, [onAudioRecorded, onTranscriptionChange]);

  const handleClick = useCallback(() => {
    if (state === "listening") {
      if (mode === "speech-recognition") {
        stopSpeechRecognition();
      } else {
        stopMediaRecorder();
      }
      return;
    }

    if (mode === "speech-recognition") {
      startSpeechRecognition();
    } else if (mode === "media-recorder") {
      startMediaRecorder();
    }
  }, [
    state,
    mode,
    stopSpeechRecognition,
    stopMediaRecorder,
    startSpeechRecognition,
    startMediaRecorder,
  ]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const isDisabled = mode === "none" || state === "processing";

  return (
    <div className="relative flex items-center justify-center">
      {state === "listening" && (
        <>
          <span className="absolute size-7 animate-ping rounded-md bg-danger/20 [animation-duration:1.5s]" />
          <span className="absolute size-7 animate-ping rounded-md bg-danger/15 [animation-delay:0.3s] [animation-duration:1.5s]" />
          <span className="absolute size-7 animate-ping rounded-md bg-danger/10 [animation-delay:0.6s] [animation-duration:1.5s]" />
        </>
      )}
      <Button
        type="button"
        variant={state === "listening" ? "destructive" : "ghost"}
        size="icon-xs"
        disabled={isDisabled}
        className={cn("relative", className)}
        onClick={handleClick}
        {...props}
      >
        {state === "processing" && (
          <IconLoader2 className="size-3.5 animate-spin" stroke={1.5} />
        )}
        {state === "listening" && (
          <IconSquare className="size-3.5" stroke={1.5} />
        )}
        {state === "idle" && (
          <IconMicrophone className="size-3.5" stroke={1.5} />
        )}
      </Button>
    </div>
  );
}
