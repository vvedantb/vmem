"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Input, Textarea, Button, Chip, addToast, Progress } from "@heroui/react";
import {
  IconLoader2,
  IconMicrophone,
  IconPlayerStop,
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconCheck,
} from "@tabler/icons-react";

export default function AddMemoryForm() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Format recording time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      addToast({
        title: "Recording Started",
        description: "Speak clearly into your microphone",
        color: "default",
      });
    } catch (error) {
      console.error("Error starting recording:", error);
      addToast({
        title: "Microphone Access Denied",
        description: "Please allow microphone access to use voice input",
        color: "danger",
      });
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const togglePlayback = useCallback(() => {
    if (!audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [audioUrl, isPlaying]);

  const discardRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setRecordingTime(0);
    setTranscription(null);
  }, [audioUrl]);

  const transcribeAudio = useCallback(async () => {
    if (!audioBlob) return;

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Transcription failed");
      }

      setTranscription(data.data.text);
      addToast({
        title: "Transcription Complete",
        description: "Review and edit the text before applying",
        color: "success",
      });
    } catch (error) {
      console.error("Transcription error:", error);
      addToast({
        title: "Transcription Failed",
        description:
          error instanceof Error ? error.message : "Failed to transcribe audio",
        color: "danger",
      });
    } finally {
      setIsTranscribing(false);
    }
  }, [audioBlob]);

  const applyTranscription = useCallback(() => {
    if (transcription) {
      setContent((prev) => (prev ? prev + "\n\n" + transcription : transcription));
      discardRecording();
      addToast({
        title: "Transcription Applied",
        description: "Text has been added to your memory content",
        color: "success",
      });
    }
  }, [transcription, discardRecording]);

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim().toLowerCase())) {
        setTags([...tags, tagInput.trim().toLowerCase()]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const resetForm = () => {
    setTitle("");
    setContent("");
    setTags([]);
    setTagInput("");
    discardRecording();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (!title.trim()) {
      addToast({
        title: "Validation Error",
        description: "Please enter a title for your memory",
        color: "danger",
      });
      return;
    }

    if (!content.trim()) {
      addToast({
        title: "Validation Error",
        description: "Please enter content for your memory",
        color: "danger",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          tags,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save memory");
      }

      addToast({
        title: "Memory Saved",
        description: "Your memory has been saved successfully",
        color: "success",
      });

      resetForm();
    } catch (error) {
      addToast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save memory",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Title
        </label>
        <Input
          type="text"
          value={title}
          onValueChange={setTitle}
          placeholder="Enter a title for your memory"
          size="lg"
          isDisabled={isSubmitting}
          classNames={{
            inputWrapper:
              "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
            input: "text-black dark:text-white",
          }}
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Content
        </label>
        <Textarea
          value={content}
          onValueChange={setContent}
          placeholder="Write your memory content here..."
          minRows={8}
          isDisabled={isSubmitting || isRecording}
          classNames={{
            inputWrapper:
              "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
            input: "text-black dark:text-white",
          }}
        />
      </div>

      {/* Voice Recording Section */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Voice Input
        </label>
        <div className="p-4 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
          {/* Recording Controls */}
          {!audioBlob && !isRecording && (
            <div className="flex items-center gap-4">
              <Button
                type="button"
                size="sm"
                variant="flat"
                onPress={startRecording}
                isDisabled={isSubmitting}
                className="bg-black/5 dark:bg-white/5"
              >
                <IconMicrophone className="w-4 h-4 mr-2" />
                Start Recording
              </Button>
              <span className="text-sm text-neutral-500">
                Record audio to transcribe into text
              </span>
            </div>
          )}

          {/* Active Recording */}
          {isRecording && (
            <div className="flex items-center gap-4">
              <Button
                type="button"
                size="sm"
                variant="flat"
                onPress={stopRecording}
                className="bg-red-500/10 text-red-600 dark:text-red-400"
              >
                <IconPlayerStop className="w-4 h-4 mr-2" />
                Stop
              </Button>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-mono tabular-nums text-neutral-700 dark:text-neutral-300">
                    {formatTime(recordingTime)}
                  </span>
                </div>
                <Progress
                  size="sm"
                  isIndeterminate
                  classNames={{
                    base: "w-24",
                    indicator: "bg-red-500",
                  }}
                  aria-label="Recording in progress"
                />
              </div>
            </div>
          )}

          {/* Recorded Audio Playback */}
          {audioBlob && !isRecording && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="flat"
                  onPress={togglePlayback}
                  isDisabled={isTranscribing}
                  className="bg-black/5 dark:bg-white/5"
                >
                  {isPlaying ? (
                    <IconPlayerPause className="w-4 h-4" />
                  ) : (
                    <IconPlayerPlay className="w-4 h-4" />
                  )}
                </Button>
                <span className="text-sm font-mono tabular-nums text-neutral-600 dark:text-neutral-400">
                  {formatTime(recordingTime)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="flat"
                  onPress={discardRecording}
                  isDisabled={isTranscribing}
                  className="bg-black/5 dark:bg-white/5 text-red-600 dark:text-red-400"
                >
                  <IconTrash className="w-4 h-4" />
                </Button>
                {!transcription && (
                  <Button
                    type="button"
                    size="sm"
                    variant="flat"
                    onPress={transcribeAudio}
                    isDisabled={isTranscribing}
                    className="bg-black/5 dark:bg-white/5 ml-auto"
                  >
                    {isTranscribing ? (
                      <>
                        <IconLoader2 className="w-4 h-4 animate-spin mr-2" />
                        Transcribing...
                      </>
                    ) : (
                      "Transcribe"
                    )}
                  </Button>
                )}
              </div>

              {/* Transcription Preview */}
              {transcription && (
                <div className="space-y-3">
                  <div className="p-3 rounded-md bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
                    <Textarea
                      value={transcription}
                      onValueChange={setTranscription}
                      minRows={3}
                      placeholder="Transcription preview..."
                      classNames={{
                        inputWrapper:
                          "bg-transparent border-none shadow-none",
                        input: "text-black dark:text-white text-sm",
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="flat"
                      onPress={applyTranscription}
                      className="bg-black dark:bg-white text-white dark:text-black"
                    >
                      <IconCheck className="w-4 h-4 mr-2" />
                      Apply to Content
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="flat"
                      onPress={discardRecording}
                      className="bg-black/5 dark:bg-white/5"
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Tags
        </label>
        <Input
          type="text"
          value={tagInput}
          onValueChange={setTagInput}
          onKeyDown={handleAddTag}
          placeholder="Type a tag and press Enter"
          size="lg"
          isDisabled={isSubmitting}
          classNames={{
            inputWrapper:
              "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
            input: "text-black dark:text-white",
          }}
        />
        {tags.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-4">
            {tags.map((tag) => (
              <Chip
                key={tag}
                variant="flat"
                onClose={() => removeTag(tag)}
                classNames={{
                  base: "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10",
                  content: "text-neutral-700 dark:text-neutral-300",
                  closeButton:
                    "text-neutral-500 hover:text-black dark:hover:text-white",
                }}
              >
                {tag}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center pt-6">
        <Button
          type="submit"
          size="lg"
          isDisabled={isSubmitting}
          className="px-12 bg-black dark:bg-white text-white dark:text-black font-medium"
        >
          {isSubmitting ? (
            <>
              <IconLoader2 className="w-4 h-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            "Save Memory"
          )}
        </Button>
      </div>
    </form>
  );
}
