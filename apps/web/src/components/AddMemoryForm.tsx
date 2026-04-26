"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, Textarea, Button, Badge, Label } from "@vmem/ui";
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
  IconUpload,
  IconFileText,
} from "@tabler/icons-react";
import { buildTagStats } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { memorySchema, type MemoryFormValues } from "@/lib/schemas";
import { ProfileDropdown } from "./ProfileDropdown";

// Maximum upload size, mirrors the server cap in `convex/fileImport.ts` so
// users see a friendly error before a 26 MB upload starts.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ACCEPTED_FILE_EXTENSIONS = ".pdf,.txt,.md,.markdown";
const ACCEPTED_MIME_TYPES = ["application/pdf", "text/plain", "text/markdown"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAcceptedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (
    lower.endsWith(".pdf") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown")
  ) {
    return true;
  }
  return ACCEPTED_MIME_TYPES.includes(file.type);
}

export default function AddMemoryForm() {
  const { memories, createMemory, uploadMemoryFile } = useMemoryContext();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MemoryFormValues>({
    resolver: zodResolver(memorySchema),
    defaultValues: { title: "", content: "", tags: [] },
  });

  const [tagInput, setTagInput] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<
    string | undefined
  >();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentTags = watch("tags");
  const allTags = useMemo(() => buildTagStats(memories ?? []), [memories]);

  const filteredSuggestions = useMemo(() => {
    if (!tagInput.trim())
      return allTags.filter((t) => !currentTags.includes(t.tag));
    const input = tagInput.toLowerCase();
    return allTags.filter(
      (t) => t.tag.includes(input) && !currentTags.includes(t.tag),
    );
  }, [tagInput, allTags, currentTags]);

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
      const current = watch("content");
      setValue(
        "content",
        current ? current + "\n\n" + transcription : transcription,
      );
      discardRecording();
      toast.success("Transcription Applied", {
        description: "Text has been added to your memory content",
      });
    }
  }, [transcription, discardRecording, setValue, watch]);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset the input so the same file can be re-selected after dismissal.
      event.target.value = "";
      if (!file) return;
      if (!isAcceptedFile(file)) {
        toast.error("Unsupported file type", {
          description: "Only .pdf, .txt, and .md files are supported.",
        });
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error("File too large", {
          description: `Maximum size is ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
        });
        return;
      }
      setPendingFile(file);
    },
    [],
  );

  const handleClearFile = useCallback(() => {
    setPendingFile(null);
  }, []);

  const handleUploadFile = useCallback(async () => {
    if (!pendingFile) return;
    setIsUploading(true);
    try {
      await uploadMemoryFile({
        file: pendingFile,
        profileId: selectedProfileId,
      });
      toast.success("File imported", {
        description: `${pendingFile.name} was added as a memory.`,
      });
      setPendingFile(null);
    } catch (error) {
      toast.error("Upload failed", {
        description:
          error instanceof Error ? error.message : "Could not import the file",
      });
    } finally {
      setIsUploading(false);
    }
  }, [pendingFile, selectedProfileId, uploadMemoryFile]);

  const handleAddTag = (
    e: React.KeyboardEvent<HTMLInputElement>,
    onChange: (tags: string[]) => void,
  ) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!currentTags.includes(tagInput.trim().toLowerCase())) {
        onChange([...currentTags, tagInput.trim().toLowerCase()]);
      }
      setTagInput("");
      setShowSuggestions(false);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (
    tag: string,
    onChange: (tags: string[]) => void,
  ) => {
    if (!currentTags.includes(tag)) {
      onChange([...currentTags, tag]);
    }
    setTagInput("");
    setShowSuggestions(false);
    tagInputRef.current?.focus();
  };

  const removeTag = (
    tagToRemove: string,
    onChange: (tags: string[]) => void,
  ) => {
    onChange(currentTags.filter((tag) => tag !== tagToRemove));
  };

  const onSubmit = async (data: MemoryFormValues) => {
    try {
      await createMemory({
        ...data,
        profileId: selectedProfileId,
      });
      toast.success("Memory Saved", {
        description: "Your memory has been saved successfully",
      });
      reset();
      discardRecording();
    } catch (error) {
      toast.error("Error", {
        description:
          error instanceof Error ? error.message : "Failed to create memory",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="flex items-center gap-3">
        <Label className="text-sm text-muted-foreground">Save to</Label>
        <ProfileDropdown
          value={selectedProfileId}
          onChange={setSelectedProfileId}
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-3">
        <Input
          type="text"
          {...register("title")}
          placeholder="Title"
          disabled={isSubmitting}
          className="h-10 bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-3">
        <Textarea
          {...register("content")}
          placeholder="Content"
          rows={8}
          disabled={isSubmitting || isRecording}
          className="bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
        />
        {errors.content && (
          <p className="text-sm text-destructive">{errors.content.message}</p>
        )}
      </div>

      <div className="space-y-3">
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          {!audioBlob && !isRecording && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={startRecording}
                disabled={isSubmitting}
                className="bg-muted"
              >
                <IconMicrophone className="w-4 h-4 mr-2" />
                Start Recording
              </Button>
              <span className="text-sm text-muted-foreground">
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
                className="bg-destructive/10 text-destructive"
              >
                <IconPlayerStop className="w-4 h-4 mr-2" />
                Stop
              </Button>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                  <span className="text-sm font-mono tabular-nums text-foreground">
                    {formatTime(recordingTime)}
                  </span>
                </div>
                <div className="relative h-2 w-24 overflow-hidden rounded-full bg-destructive/20">
                  <div className="absolute h-full w-1/3 rounded-full bg-destructive animate-indeterminate" />
                </div>
              </div>
            </div>
          )}

          {audioBlob && !isRecording && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={togglePlayback}
                  disabled={isTranscribing}
                  className="bg-muted"
                >
                  {isPlaying ? (
                    <IconPlayerPause className="w-4 h-4" />
                  ) : (
                    <IconPlayerPlay className="w-4 h-4" />
                  )}
                </Button>
                <span className="text-sm font-mono tabular-nums text-muted-foreground">
                  {formatTime(recordingTime)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={discardRecording}
                  disabled={isTranscribing}
                  className="bg-muted text-destructive"
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
                    className="bg-muted ml-auto"
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
                  <div className="p-3 rounded-md bg-muted/50 border border-border">
                    <Textarea
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value)}
                      rows={3}
                      placeholder="Transcription preview..."
                      className="border-none bg-transparent shadow-none text-foreground text-sm focus-visible:ring-0"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={applyTranscription}
                      className="bg-primary text-primary-foreground"
                    >
                      <IconCheck className="w-4 h-4 mr-2" />
                      Apply to Content
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={discardRecording}
                      className="bg-muted"
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
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_EXTENSIONS}
            onChange={handleFileSelect}
            disabled={isSubmitting || isUploading}
            className="hidden"
          />
          {!pendingFile ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || isUploading}
                className="bg-muted"
              >
                <IconUpload className="w-4 h-4 mr-2" />
                Upload file
              </Button>
              <span className="text-sm text-muted-foreground">
                Import a PDF, .txt, or .md file as a memory
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <IconFileText className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium truncate text-foreground">
                    {pendingFile.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(pendingFile.size)}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleUploadFile}
                  disabled={isUploading}
                  className="bg-primary text-primary-foreground"
                >
                  {isUploading ? (
                    <>
                      <IconLoader2 className="w-4 h-4 animate-spin mr-2" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <IconUpload className="w-4 h-4 mr-2" />
                      Import as memory
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleClearFile}
                  disabled={isUploading}
                  className="bg-muted"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Controller
        name="tags"
        control={control}
        render={({ field }) => (
          <div className="space-y-3">
            <div className="relative">
              <Input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onKeyDown={(e) => handleAddTag(e, field.onChange)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                placeholder="Tags (press Enter to add)"
                disabled={isSubmitting}
                className="h-10 bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                  {filteredSuggestions.map((item) => (
                    <Button
                      key={item.tag}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => selectSuggestion(item.tag, field.onChange)}
                      className="w-full h-auto px-4 py-2 text-left flex items-center justify-between hover:bg-accent transition-colors"
                    >
                      <span className="text-sm text-foreground">
                        {item.tag}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.count} {item.count === 1 ? "memory" : "memories"}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
            {field.value.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-4">
                {field.value.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-muted border border-border text-foreground gap-1"
                  >
                    {tag}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeTag(tag, field.onChange)}
                      className="ml-1 h-auto w-auto p-0 text-muted-foreground hover:text-foreground"
                    >
                      <IconX className="w-3 h-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      />

      <div className="flex justify-center pt-6">
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="px-12 bg-primary text-primary-foreground font-medium"
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
