"use client";

import { useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
  Button,
  Input,
  Textarea,
  Badge,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@vmem/ui";
import {
  IconPlus,
  IconX,
  IconPaperclip,
  IconHash,
  IconLoader2,
  IconFileText,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { memorySchema, type MemoryFormValues } from "@/lib/schemas";
import { ProfileDropdown } from "./ProfileDropdown";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { buildTagStats } from "@/lib/memories";
import { formatFileSize } from "@/components/files/_utils";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ACCEPTED_FILE_EXTENSIONS = ".pdf,.txt,.md,.markdown";

function isAcceptedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".pdf") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    file.type === "application/pdf" ||
    file.type === "text/plain" ||
    file.type === "text/markdown"
  );
}

// linear-style memory creation modal
export default function AddMemoryModal({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const { memories, createMemory, uploadMemoryFile } = useMemoryContext();
  const activeProfileId = useActiveProfile()._id;
  const [open, setOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<
    string | undefined
  >();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MemoryFormValues>({
    resolver: zodResolver(memorySchema),
    defaultValues: { title: "", content: "", tags: [] },
  });

  const currentTags = watch("tags");
  const allTags = useMemo(() => buildTagStats(memories ?? []), [memories]);
  const normalizedTagInput = tagInput.trim().toLowerCase();

  // suggestions hide tags already on the memory and (when typing) filter by
  // substring match — same behaviour as the legacy AddMemoryForm
  const filteredSuggestions = useMemo(() => {
    const available = allTags.filter((t) => !currentTags.includes(t.tag));
    if (!normalizedTagInput) return available;
    return available.filter((t) => t.tag.includes(normalizedTagInput));
  }, [normalizedTagInput, allTags, currentTags]);

  // show "Create …" only when the typed string is brand-new (not in the
  // existing tag corpus and not already on this memory)
  const canCreateTag =
    normalizedTagInput.length > 0 &&
    !currentTags.includes(normalizedTagInput) &&
    !allTags.some((t) => t.tag === normalizedTagInput);

  const addTag = (raw: string, onChange: (tags: string[]) => void) => {
    const tag = raw.trim().toLowerCase();
    if (!tag || currentTags.includes(tag)) return;
    onChange([...currentTags, tag]);
    setTagInput("");
  };

  const removeTag = (tag: string, onChange: (tags: string[]) => void) => {
    onChange(currentTags.filter((t) => t !== tag));
  };

  // single source of truth for "the modal closed" — fires for cancel,
  // escape, click-outside, and post-submit success paths
  const resetForm = () => {
    reset();
    setTagInput("");
    setTagPopoverOpen(false);
    setSelectedProfileId(undefined);
    setPendingFile(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedFile(file)) {
      toast.error("Only .pdf, .txt, and .md files are supported");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`File too large — max ${formatFileSize(MAX_UPLOAD_BYTES)}`);
      return;
    }
    setPendingFile(file);
  };

  const handleImportFile = async () => {
    if (!pendingFile) return;
    setIsUploading(true);
    try {
      await uploadMemoryFile({
        file: pendingFile,
        profileId: selectedProfileId ?? activeProfileId,
      });
      toast.success("File imported", {
        description: `${pendingFile.name} added as a memory`,
      });
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import file",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateMemory = async (data: MemoryFormValues) => {
    try {
      await createMemory({
        ...data,
        profileId: selectedProfileId ?? activeProfileId,
      });
      toast.success("Memory saved");
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save memory",
      );
    }
  };

  const isBusy = isSubmitting || isUploading;
  const fieldError = errors.title?.message ?? errors.content?.message;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) resetForm();
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <IconPlus size={18} />
            Add Memory
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="max-w-xl gap-0 overflow-hidden p-0"
        hideCloseButton
      >
        <form
          onSubmit={handleSubmit(handleCreateMemory)}
          className="flex flex-col"
        >
          {/* Body — title + description live as borderless text on the
              modal surface. When a file is staged for import we swap them
              for a single attachment chip so the action is unambiguous. */}
          <div className="flex flex-col gap-2 px-5 pt-5 pb-4">
            {pendingFile ? (
              <div className="flex items-center gap-3 rounded-lg bg-surface-secondary/50 px-3 py-3">
                <IconFileText className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {pendingFile.name}
                  </p>
                  <p className="text-xs text-muted">
                    {formatFileSize(pendingFile.size)} · ready to import
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setPendingFile(null)}
                  disabled={isBusy}
                  className="text-muted hover:text-foreground"
                >
                  <IconX size={14} />
                </Button>
              </div>
            ) : (
              <>
                <Input
                  {...register("title")}
                  placeholder="Memory title"
                  disabled={isBusy}
                  autoFocus
                  className="h-auto w-full border-0 bg-transparent px-0 py-0 text-lg font-medium text-foreground shadow-none placeholder:text-field-placeholder focus-visible:border-transparent focus-visible:ring-0 disabled:opacity-60"
                />
                <Textarea
                  {...register("content")}
                  placeholder="Add a description…"
                  rows={5}
                  disabled={isBusy}
                  className="min-h-0 w-full resize-none border-0 bg-transparent px-0 py-0 text-sm leading-relaxed text-foreground shadow-none placeholder:text-field-placeholder focus-visible:border-transparent focus-visible:ring-0 disabled:opacity-60"
                />
                {fieldError && (
                  <p className="text-xs text-danger">{fieldError}</p>
                )}
              </>
            )}
          </div>

          {/* Selected tag chips sit between the body and the toolbar so
              they read as part of the memory, not as a control. */}
          {currentTags.length > 0 && (
            <Controller
              name="tags"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-1.5 px-5 pb-3">
                  {field.value.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-1 bg-surface-secondary px-2 py-0.5 font-normal"
                    >
                      <IconHash size={11} className="text-muted" />
                      {tag}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeTag(tag, field.onChange)}
                        className="-mr-1 ml-0.5 text-muted hover:text-foreground"
                      >
                        <IconX className="size-[11px]" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            />
          )}

          {/* Toolbar — tonal surface shift (no border) carries metadata
              badges on the left and primary actions on the right. */}
          <div className="flex items-center justify-between gap-2 bg-surface-secondary/40 px-3 py-2">
            <div className="flex items-center gap-1">
              {/* Profile picker styled as a borderless badge. */}
              <ProfileDropdown
                value={selectedProfileId}
                onChange={setSelectedProfileId}
                disabled={isBusy}
                lockToActiveWorkspace
                className="h-7 min-w-0 gap-1.5 border-0 bg-transparent px-2 text-xs font-normal text-foreground shadow-none hover:bg-surface-tertiary/50 [&[data-state=open]]:bg-surface-tertiary/50 [&>svg]:size-3.5"
              />

              {/* Tags badge → popover with search + suggestions + create. */}
              <Controller
                name="tags"
                control={control}
                render={({ field }) => (
                  <Popover
                    open={tagPopoverOpen}
                    onOpenChange={(value) => {
                      setTagPopoverOpen(value);
                      if (!value) setTagInput("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        className="h-7 gap-1.5 px-2 text-xs font-normal text-muted hover:bg-surface-tertiary/50 hover:text-foreground data-[state=open]:bg-surface-tertiary/50 data-[state=open]:text-foreground"
                      >
                        <IconHash size={13} />
                        {field.value.length > 0
                          ? `${field.value.length} tag${field.value.length > 1 ? "s" : ""}`
                          : "Tags"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-2">
                      <Input
                        autoFocus
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && normalizedTagInput) {
                            e.preventDefault();
                            addTag(tagInput, field.onChange);
                          }
                        }}
                        placeholder="Add or search tags…"
                        className="h-8 rounded-field border-border bg-field-background px-2 text-sm text-foreground placeholder:text-field-placeholder"
                      />
                      <div className="mt-2 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                        {filteredSuggestions.slice(0, 10).map((item) => (
                          <Button
                            key={item.tag}
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => addTag(item.tag, field.onChange)}
                            className="flex h-auto w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-tertiary/80"
                          >
                            <span className="flex items-center gap-1.5">
                              <IconHash className="size-3 text-muted" />
                              {item.tag}
                            </span>
                            <span className="text-xs text-muted tabular-nums">
                              {item.count}
                            </span>
                          </Button>
                        ))}
                        {canCreateTag && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => addTag(tagInput, field.onChange)}
                            className="flex h-auto w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-tertiary/80"
                          >
                            <IconPlus className="size-3 text-muted" />
                            Create &ldquo;{normalizedTagInput}&rdquo;
                          </Button>
                        )}
                        {!canCreateTag && filteredSuggestions.length === 0 && (
                          <p className="px-2 py-3 text-center text-xs text-muted">
                            {allTags.length === 0
                              ? "Type to create a tag"
                              : "All matching tags added"}
                          </p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              />

              {/* Attach badge — disabled once a file is staged. */}
              <Input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_EXTENSIONS}
                onChange={handleFileSelect}
                disabled={isBusy}
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy || pendingFile !== null}
                className="h-7 gap-1.5 px-2 text-xs font-normal text-muted hover:bg-surface-tertiary/50 hover:text-foreground"
              >
                <IconPaperclip size={13} />
                Attach
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  className="h-7 px-3 text-xs"
                >
                  Cancel
                </Button>
              </DialogClose>
              {pendingFile ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleImportFile}
                  disabled={isBusy}
                  className="h-7 gap-1.5 px-3 text-xs"
                >
                  {isUploading && (
                    <IconLoader2 size={12} className="animate-spin" />
                  )}
                  {isUploading ? "Importing…" : "Import file"}
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  disabled={isBusy}
                  className="h-7 gap-1.5 px-3 text-xs"
                >
                  {isSubmitting && (
                    <IconLoader2 size={12} className="animate-spin" />
                  )}
                  {isSubmitting ? "Saving…" : "Save memory"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
