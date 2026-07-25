import { useState, type FormEvent } from "react";
import { Button, Input, Textarea, Badge } from "@vmem/ui";
import { toast } from "sonner";
import { IconCheck, IconLoader2 } from "@tabler/icons-react";
import type { Memory } from "@/lib/memories";
import { useMemoryContext } from "@/contexts/MemoryContext";
import { memorySchema } from "@/lib/schemas";
import TagInputWithSuggestions from "./TagInputWithSuggestions";
import MemoryProvenance from "./MemoryProvenance";
import { DetailSection } from "./detail-panel/DetailSection";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";

const DETAILS_ROOT_CLASS = "min-w-0 space-y-5 overflow-x-hidden pb-2";

interface DetailsTabViewProps {
  memory: Memory;
}

export function DetailsTabView({ memory }: DetailsTabViewProps) {
  return (
    <div className={DETAILS_ROOT_CLASS}>
      <div className="min-w-0 overflow-hidden rounded-lg bg-surface-secondary/60 p-4">
        <p className="overflow-wrap-anywhere whitespace-pre-wrap text-[15px] leading-relaxed text-pretty text-foreground">
          {memory.content}
        </p>
      </div>

      <MemoryProvenance memory={memory} />

      <DetailSection label="Tags">
        {memory.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {memory.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No tags</p>
        )}
      </DetailSection>
    </div>
  );
}

interface DetailsTabEditProps {
  memory: Memory;
  onCancel: () => void;
}

export function DetailsTabEdit({ memory, onCancel }: DetailsTabEditProps) {
  const { updateMemory } = useMemoryContext();
  const [tags, setTags] = useState(memory.tags);
  const [contentError, setContentError] = useState<string | null>(null);
  const { submitting: isSubmitting, run } = useAsyncSubmit();

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const rawTitle = formData.get("title");
    const rawContent = formData.get("content");
    const title = typeof rawTitle === "string" ? rawTitle : "";
    const content = typeof rawContent === "string" ? rawContent : "";
    const parsed = memorySchema.safeParse({ title, content, tags });
    if (!parsed.success) {
      const contentIssue = parsed.error.issues.find(
        (issue) => issue.path[0] === "content",
      );
      setContentError(contentIssue?.message ?? "Invalid memory content");
      return;
    }
    setContentError(null);

    await run(async () => {
      const updated = await updateMemory({
        id: memory.id,
        title: parsed.data.title,
        content: parsed.data.content,
        tags: parsed.data.tags,
      });

      if (!updated) {
        throw new Error("Memory not found");
      }

      onCancel();
      toast.success("Memory updated successfully");
    }, "Failed to update memory");
  };

  return (
    <form className={DETAILS_ROOT_CLASS} onSubmit={onSave}>
      <div className="space-y-3 rounded-lg bg-surface-secondary/60 p-4">
        <Input
          name="title"
          defaultValue={memory.title}
          placeholder="Memory title"
          disabled={isSubmitting}
          className="h-10 rounded-field border-border bg-field-background text-foreground text-base font-semibold placeholder:text-field-placeholder"
        />
        <Textarea
          name="content"
          defaultValue={memory.content}
          placeholder="Memory content"
          rows={8}
          disabled={isSubmitting}
          className="min-h-[160px] rounded-field border-border bg-field-background text-foreground placeholder:text-field-placeholder"
        />
        {contentError ? (
          <p className="text-sm text-danger">{contentError}</p>
        ) : null}
      </div>

      <MemoryProvenance memory={memory} />

      <DetailSection label="Tags">
        <TagInputWithSuggestions
          tags={tags}
          onChange={setTags}
          disabled={isSubmitting}
        />
      </DetailSection>

      <div className="sticky bottom-0 flex items-center justify-end gap-3 bg-surface-primary pt-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
          className="text-muted"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <IconLoader2 size={16} className="animate-spin" />
          ) : (
            <IconCheck size={16} />
          )}
          {isSubmitting ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
