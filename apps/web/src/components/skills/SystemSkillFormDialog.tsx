"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
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
import {
  patchSystemSkillCatalog,
  type SystemSkillEntry,
} from "@/components/skills/_utils";
import { useActiveTeamId } from "@/components/workspace/active-profile";

interface SystemSkillFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // undefined = create a new catalog skill; provided = edit it
  entry?: SystemSkillEntry;
}

// admin-only create/edit form for a catalog system skill
export function SystemSkillFormDialog({
  open,
  onOpenChange,
  entry,
}: SystemSkillFormDialogProps) {
  const teamId = useActiveTeamId();
  const catalogArgs = { teamId };
  const adminCreate = useMutation(api.systemSkills.adminCreate);
  const adminUpdate = useMutation(
    api.systemSkills.adminUpdate,
  ).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.systemSkills.listCatalog, catalogArgs);
    if (!current) return;
    store.setQuery(
      api.systemSkills.listCatalog,
      catalogArgs,
      patchSystemSkillCatalog(current, args.id, {
        ...(args.name !== undefined ? { name: args.name.trim() } : {}),
        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
        ...(args.instructions !== undefined
          ? { instructions: args.instructions }
          : {}),
        ...(args.category !== undefined
          ? { category: args.category ?? undefined }
          : {}),
        ...(args.published !== undefined ? { published: args.published } : {}),
      }),
    );
  });

  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createInstructions, setCreateInstructions] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createPublished, setCreatePublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = entry !== undefined;

  const resetCreateForm = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateInstructions("");
    setCreateCategory("");
    setCreatePublished(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetCreateForm();
    onOpenChange(next);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || isEdit) return;

    const trimmedName = createName.trim();
    if (trimmedName.length === 0) {
      toast.error("Name is required");
      return;
    }
    if (createInstructions.trim().length === 0) {
      toast.error("Instructions are required");
      return;
    }

    const trimmedCategory = createCategory.trim();
    setSubmitting(true);
    try {
      await adminCreate({
        name: trimmedName,
        description: createDescription.trim(),
        instructions: createInstructions,
        category: trimmedCategory.length > 0 ? trimmedCategory : undefined,
        published: createPublished,
      });
      toast.success(`Created ${trimmedName}`);
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditDone = async () => {
    if (submitting || !entry) return;

    const trimmedName = entry.name.trim();
    if (trimmedName.length === 0) {
      toast.error("Name is required");
      return;
    }
    if (entry.instructions.trim().length === 0) {
      toast.error("Instructions are required");
      return;
    }

    if (trimmedName !== entry.name) {
      setSubmitting(true);
      try {
        await adminUpdate({ id: entry._id, name: trimmedName });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
        return;
      } finally {
        setSubmitting(false);
      }
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,760px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit system skill" : "New system skill"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isEdit) {
              void handleEditDone();
              return;
            }
            void handleCreateSubmit(e);
          }}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        >
          <Input
            value={isEdit ? entry.name : createName}
            onChange={(e) => {
              if (isEdit) {
                void adminUpdate({ id: entry._id, name: e.target.value });
                return;
              }
              setCreateName(e.target.value);
            }}
            placeholder="Name"
            aria-label="Name"
            autoFocus
          />
          <Input
            value={isEdit ? (entry.category ?? "") : createCategory}
            onChange={(e) => {
              if (isEdit) {
                const value = e.target.value;
                void adminUpdate({
                  id: entry._id,
                  category: value.trim().length > 0 ? value : undefined,
                });
                return;
              }
              setCreateCategory(e.target.value);
            }}
            placeholder="Category (optional, e.g. Codebases)"
            aria-label="Category"
          />
          <Textarea
            value={isEdit ? entry.description : createDescription}
            onChange={(e) => {
              if (isEdit) {
                void adminUpdate({
                  id: entry._id,
                  description: e.target.value,
                });
                return;
              }
              setCreateDescription(e.target.value);
            }}
            placeholder="What this skill is for"
            aria-label="Description"
            rows={3}
            className="min-h-[4.5rem] resize-y"
          />
          <Textarea
            value={isEdit ? entry.instructions : createInstructions}
            onChange={(e) => {
              if (isEdit) {
                void adminUpdate({
                  id: entry._id,
                  instructions: e.target.value,
                });
                return;
              }
              setCreateInstructions(e.target.value);
            }}
            placeholder="Instructions (markdown playbook the agent follows)"
            aria-label="Instructions"
            className="min-h-[240px] font-mono text-xs"
          />

          <div className="flex items-center gap-2">
            <Switch
              id="system-skill-published"
              checked={isEdit ? entry.published : createPublished}
              onCheckedChange={(checked) => {
                if (isEdit) {
                  void adminUpdate({ id: entry._id, published: checked });
                  return;
                }
                setCreatePublished(checked);
              }}
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
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : null}
              {isEdit ? "Done" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
