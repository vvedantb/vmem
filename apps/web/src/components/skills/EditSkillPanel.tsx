"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import { Button, Input, Textarea } from "@vmem/ui";
import { IconX, IconTrash, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

interface EditSkillPanelProps {
  skill: Doc<"skills">;
  onClose: () => void;
}

export function EditSkillPanel({ skill, onClose }: EditSkillPanelProps) {
  const updateSkill = useMutation(api.skills.updateSkill);
  const deleteSkill = useMutation(api.skills.deleteSkill);

  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [instructions, setInstructions] = useState(skill.instructions);
  const [submitting, setSubmitting] = useState(false);

  // Re-sync form state when skill changes
  useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setInstructions(skill.instructions);
  }, [skill._id, skill.name, skill.description, skill.instructions]);

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
      await updateSkill({
        id: skill._id,
        name: trimmedName,
        description: description.trim(),
        instructions,
      });
      toast.success(`Updated ${trimmedName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update skill";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete skill "${skill.name}"?`)) return;
    try {
      await deleteSkill({ id: skill._id });
      toast.success(`Deleted ${skill.name}`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast.error(msg);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">Edit Skill</h2>
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
        <Input
          id="edit-skill-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Name"
        />

        <Textarea
          id="edit-skill-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this skill is for"
          aria-label="Description"
          rows={3}
          className="min-h-[4.5rem] resize-y"
        />

        <Textarea
          id="edit-skill-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Instructions"
          aria-label="Instructions"
          className="min-h-[240px] flex-1 font-mono text-xs"
        />

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <IconTrash size={14} />
            Delete
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting && <IconLoader2 size={14} className="animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
