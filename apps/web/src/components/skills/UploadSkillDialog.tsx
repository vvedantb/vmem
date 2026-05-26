"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import { IconLoader2, IconUpload } from "@tabler/icons-react";
import { toast } from "sonner";
import { optimisticId } from "@/lib/optimisticId";

interface UploadSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (skillId: Id<"skills">) => void;
}

function isMarkdownFile(file: File): boolean {
  return /\.(md|markdown)$/i.test(file.name);
}

function readSkillFile(
  file: File,
): Promise<{ name: string; instructions: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      resolve({
        name: file.name.replace(/\.(md|markdown)$/i, ""),
        instructions: text,
      });
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    reader.readAsText(file);
  });
}

export function UploadSkillDialog({
  open,
  onOpenChange,
  onCreated,
}: UploadSkillDialogProps) {
  const createSkill = useMutation(api.skills.createSkill).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.skills.listMy, {});
      if (!current || current.length === 0) return;
      const now = Date.now();
      const tempId = optimisticId("skills");
      const row: Doc<"skills"> = {
        _id: tempId,
        _creationTime: now,
        userId: current[0].userId,
        name: args.name.trim(),
        description: args.description,
        instructions: args.instructions,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      localStore.setQuery(api.skills.listMy, {}, [row, ...current]);
    },
  );
  const [submitting, setSubmitting] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || submitting) return;

    if (!isMarkdownFile(file)) {
      toast.error("Only .md and .markdown files are supported");
      return;
    }

    setSubmitting(true);
    try {
      const { name, instructions } = await readSkillFile(file);
      const trimmedName = name.trim();
      if (trimmedName.length === 0) {
        toast.error("Could not derive a skill name from the file");
        return;
      }
      if (instructions.trim().length === 0) {
        toast.error("Skill file is empty");
        return;
      }

      const skillId = await createSkill({
        name: trimmedName,
        description: "",
        instructions,
      });
      toast.success(`Added ${trimmedName}`);
      onOpenChange(false);
      onCreated(skillId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to upload skill";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    void handleFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void handleFile(e.dataTransfer.files[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload skill</DialogTitle>
        </DialogHeader>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={handleDrop}
          className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg bg-surface-secondary/20 px-4 py-8 text-center transition-colors hover:bg-surface-secondary/35"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary/60">
            {submitting ? (
              <IconLoader2 size={22} className="animate-spin text-muted" />
            ) : (
              <IconUpload size={22} className="text-muted" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Drop a markdown skill file here
            </p>
            <p className="text-xs text-muted">or click to choose a .md file</p>
          </div>
          <input
            type="file"
            accept=".md,.markdown,text/markdown"
            className="sr-only"
            onChange={handleChange}
            disabled={submitting}
          />
        </label>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
