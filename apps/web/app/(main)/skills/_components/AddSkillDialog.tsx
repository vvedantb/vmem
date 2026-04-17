"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@vmem/ui";
import { IconUpload, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

interface AddSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSkillDialog({ open, onOpenChange }: AddSkillDialogProps) {
  const createSkill = useMutation(api.skills.createSkill);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setInstructions("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setInstructions(text);
      if (name.trim().length === 0) {
        const filename = file.name.replace(/\.(md|markdown)$/i, "");
        setName(filename);
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      toast.error("Name is required");
      return;
    }
    if (instructions.trim().length === 0) {
      toast.error("Instructions are required");
      return;
    }

    setSubmitting(true);
    try {
      await createSkill({
        name: trimmedName,
        description: description.trim(),
        instructions,
      });
      toast.success(`Added ${trimmedName}`);
      reset();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add skill";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Skill</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              onChange={handleFile}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconUpload size={14} />
              Upload .md
            </Button>
            <span className="text-xs text-muted-foreground">
              Optional — prefills instructions and name from the file.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skill-name">Name</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. refactor-typescript"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skill-description">Description</Label>
            <Input
              id="skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this skill is for"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skill-instructions">Instructions</Label>
            <Textarea
              id="skill-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Markdown body — the instructions the agent should follow when using this skill."
              className="min-h-[240px] font-mono text-xs"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <IconLoader2 size={14} className="animate-spin" />}
              Add Skill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
