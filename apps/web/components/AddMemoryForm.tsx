"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Input, Textarea, Button, Badge } from "@vmem/ui";
import { toast } from "sonner";
import {
  IconLoader2,
  IconMicrophone,
  IconPlayerStop,
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconCheck,
  IconX,
} from "@tabler/icons-react";

interface TagStats {
  tag: string;
  count: number;
}

export default function AddMemoryForm() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [allTags, setAllTags] = useState<TagStats[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await fetch("/api/memories/tags");
        const data = await response.json();
        if (data.success) {
          setAllTags(data.data);
        }
      } catch (error) {
        console.error("Failed to fetch tags:", error);
      }
    };
    fetchTags();
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (!tagInput.trim()) return allTags.filter((t) => !tags.includes(t.tag));
    const input = tagInput.toLowerCase();
    return allTags.filter(
      (t) => t.tag.includes(input) && !tags.includes(t.tag),
    );
  }, [tagInput, allTags, tags]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

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
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      toast("Recording Started", {
        description: "Speak clearly into your microphone",
      });
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error("Microphone Access Denied", {
        description: "Please allow microphone access to use voice input",
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
      toast.success("Transcription Complete", {
        description: "Review and edit the text before applying",
      });
    } catch (error) {
      console.error("Transcription error:", error);
      toast.error("Transcription Failed", {
        description:
          error instanceof Error ? error.message : "Failed to transcribe audio",
      });
    } finally {
      setIsTranscribing(false);
    }
  }, [audioBlob]);

  const applyTranscription = useCallback(() => {
    if (transcription) {
      setContent((prev) =>
        prev ? prev + "\n\n" + transcription : transcription,
      );
      discardRecording();
      toast.success("Transcription Applied", {
        description: "Text has been added to your memory content",
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
      setShowSuggestions(false);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
    setShowSuggestions(false);
    tagInputRef.current?.focus();
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

    if (!title.trim()) {
      toast.error("Validation Error", {
        description: "Please enter a title for your memory",
      });
      return;
    }

    if (!content.trim()) {
      toast.error("Validation Error", {
        description: "Please enter content for your memory",
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

      toast.success("Memory Saved", {
        description: "Your memory has been saved successfully",
      });

      resetForm();
    } catch (error) {
      toast.error("Error", {
        description:
          error instanceof Error ? error.message : "Failed to save memory",
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
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter a title for your memory"
          disabled={isSubmitting}
          className="h-10 bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus-visible:border-black/30 dark:focus-visible:border-white/30"
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Content
        </label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your memory content here..."
          rows={8}
          disabled={isSubmitting || isRecording}
          className="bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus-visible:border-black/30 dark:focus-visible:border-white/30"
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Voice Input
        </label>
        <div className="p-4 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
          {!audioBlob && !isRecording && (
            <div className="flex items-center gap-4">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={startRecording}
                disabled={isSubmitting}
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

          {isRecording && (
            <div className="flex items-center gap-4">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={stopRecording}
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
                <div className="relative h-2 w-24 overflow-hidden rounded-full bg-red-500/20">
                  <div className="absolute h-full w-1/3 rounded-full bg-red-500 animate-[indeterminate_1.5s_ease-in-out_infinite]" />
                </div>
              </div>
            </div>
          )}

          {audioBlob && !isRecording && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={togglePlayback}
                  disabled={isTranscribing}
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
                  variant="secondary"
                  onClick={discardRecording}
                  disabled={isTranscribing}
                  className="bg-black/5 dark:bg-white/5 text-red-600 dark:text-red-400"
                >
                  <IconTrash className="w-4 h-4" />
                </Button>
                {!transcription && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={transcribeAudio}
                    disabled={isTranscribing}
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

              {transcription && (
                <div className="space-y-3">
                  <div className="p-3 rounded-md bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
                    <Textarea
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value)}
                      rows={3}
                      placeholder="Transcription preview..."
                      className="border-none bg-transparent shadow-none text-black dark:text-white text-sm focus-visible:ring-0"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={applyTranscription}
                      className="bg-black dark:bg-white text-white dark:text-black"
                    >
                      <IconCheck className="w-4 h-4 mr-2" />
                      Apply to Content
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={discardRecording}
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
        <div className="relative">
          <Input
            ref={tagInputRef}
            type="text"
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={handleAddTag}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              setTimeout(() => setShowSuggestions(false), 200);
            }}
            placeholder="Type a tag and press Enter"
            disabled={isSubmitting}
            className="h-10 bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus-visible:border-black/30 dark:focus-visible:border-white/30"
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg">
              {filteredSuggestions.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => selectSuggestion(item.tag)}
                  className="w-full px-4 py-2 text-left flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm text-neutral-800 dark:text-neutral-200">
                    {item.tag}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {item.count} {item.count === 1 ? "memory" : "memories"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-4">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300 gap-1"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 text-neutral-500 hover:text-black dark:hover:text-white"
                >
                  <IconX className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center pt-6">
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
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
