"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { Button, Input, Textarea } from "@vmem/ui";
import { IconUpload, IconX, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

interface AddSkillPanelProps {
  onClose: () => void;
  onCreated: () => void;
}

export function AddSkillPanel({ onClose, onCreated }: AddSkillPanelProps) {
  const createSkill = useMutation(api.skills.createSkill);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add skill";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">Add Skill</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close panel"
        >
          <IconX size={18} />
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
      >
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
            Optional — prefills from file.
          </span>
        </div>

        <Input
          id="skill-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Name"
          autoFocus
        />

        <Textarea
          id="skill-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this skill is for"
          aria-label="Description"
          rows={3}
          className="min-h-[4.5rem] resize-y"
        />

        <Textarea
          id="skill-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Instructions"
          aria-label="Instructions"
          className="min-h-[240px] flex-1 font-mono text-xs"
        />

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting && <IconLoader2 size={14} className="animate-spin" />}
            Add Skill
          </Button>
        </div>
      </form>
    </div>
  );
}
