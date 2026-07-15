import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
} from "@vmem/ui";
import { toast } from "sonner";
import { type SystemSkillEntry } from "@/components/skills/_utils";
import { SkillFormShell } from "@/components/skills/SkillFormShell";

interface SystemSkillFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // undefined = create a new catalogue skill; provided = edit it
  entry?: SystemSkillEntry;
}

// admin-only create/edit form for a catalogue system skill
export function SystemSkillFormDialog({
  open,
  onOpenChange,
  entry,
}: SystemSkillFormDialogProps) {
  const adminCreate = useMutation(api.systemSkills.adminCreate);
  const adminUpdate = useMutation(api.systemSkills.adminUpdate);

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

        <SkillFormShell
          name={isEdit ? entry.name : createName}
          description={isEdit ? entry.description : createDescription}
          instructions={isEdit ? entry.instructions : createInstructions}
          onNameChange={(value) => {
            if (isEdit) {
              void adminUpdate({ id: entry._id, name: value });
              return;
            }
            setCreateName(value);
          }}
          onDescriptionChange={(value) => {
            if (isEdit) {
              void adminUpdate({ id: entry._id, description: value });
              return;
            }
            setCreateDescription(value);
          }}
          onInstructionsChange={(value) => {
            if (isEdit) {
              void adminUpdate({ id: entry._id, instructions: value });
              return;
            }
            setCreateInstructions(value);
          }}
          onSubmit={(e) => {
            e.preventDefault();
            if (isEdit) {
              void handleEditDone();
              return;
            }
            void handleCreateSubmit(e);
          }}
          onCancel={() => handleOpenChange(false)}
          submitting={submitting}
          submitLabel={isEdit ? "Done" : "Create"}
          instructionsPlaceholder="Instructions (markdown playbook the agent follows)"
          afterName={
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
          }
          beforeFooter={
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
          }
        />
      </DialogContent>
    </Dialog>
  );
}
