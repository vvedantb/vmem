"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Textarea,
} from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

type SystemSkillEntry = FunctionReturnType<
  typeof api.systemSkills.listCatalog
>[number];

interface SystemSkillFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Undefined = create a new catalog skill; provided = edit it. */
  entry?: SystemSkillEntry;
}

/** Admin-only create/edit form for a catalog system skill. */
export function SystemSkillFormDialog({
  open,
  onOpenChange,
  entry,
}: SystemSkillFormDialogProps) {
  const adminCreate = useMutation(api.systemSkills.adminCreate);
  const adminUpdate = useMutation(api.systemSkills.adminUpdate);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [category, setCategory] = useState("");
  const [published, setPublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Hydrate the draft when the dialog opens (snapshot to edit / blank to create).
  useEffect(() => {
    if (!open) return;
    setName(entry?.name ?? "");
    setDescription(entry?.description ?? "");
    setInstructions(entry?.instructions ?? "");
    setCategory(entry?.category ?? "");
    setPublished(entry?.published ?? false);
  }, [open, entry]);

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

    const trimmedCategory = category.trim();
    setSubmitting(true);
    try {
      if (entry) {
        await adminUpdate({
          id: entry._id,
          name: trimmedName,
          description: description.trim(),
          instructions,
          category: trimmedCategory.length > 0 ? trimmedCategory : undefined,
          published,
        });
        toast.success("System skill updated");
      } else {
        await adminCreate({
          name: trimmedName,
          description: description.trim(),
          instructions,
          category: trimmedCategory.length > 0 ? trimmedCategory : undefined,
          published,
        });
        toast.success(`Created ${trimmedName}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,760px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {entry ? "Edit system skill" : "New system skill"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
            autoFocus
          />
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional, e.g. Codebases)"
            aria-label="Category"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this skill is for"
            aria-label="Description"
            rows={3}
            className="min-h-[4.5rem] resize-y"
          />
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instructions (markdown playbook the agent follows)"
            aria-label="Instructions"
            className="min-h-[240px] font-mono text-xs"
          />

          <div className="flex items-center gap-2">
            <Switch
              id="system-skill-published"
              checked={published}
              onCheckedChange={setPublished}
            />
            <Label htmlFor="system-skill-published" className="text-sm">
              Published (visible in the Hub)
            </Label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : null}
              {entry ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
