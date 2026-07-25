import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { toast } from "sonner";
import { BulkSelectionDeleteBar } from "@/components/shell/BulkSelectionDeleteBar";
import { removeSkillsFromLists } from "@/lib/convex-optimistic";

interface SkillBulkDeleteBarProps {
  selectedIds: ReadonlySet<Id<"skills">>;
  // clear the selection and leave select mode
  onExit: () => void;
}

// selection-mode action bar for the skills sidebar
export function SkillBulkDeleteBar({
  selectedIds,
  onExit,
}: SkillBulkDeleteBarProps) {
  const deleteSkills = useMutation(
    api.skills.deleteSkills,
  ).withOptimisticUpdate((localStore, args) => {
    removeSkillsFromLists(localStore, args.ids);
  });

  const count = selectedIds.size;
  const itemWord = count === 1 ? "skill" : "skills";

  return (
    <BulkSelectionDeleteBar
      count={count}
      itemWord={itemWord}
      description="The selected skills will be permanently removed. This cannot be undone."
      onExit={onExit}
      onDelete={async () => {
        if (count === 0) return;
        try {
          await deleteSkills({ ids: [...selectedIds] });
          toast.success(`Deleted ${count} ${itemWord}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to delete");
          throw err;
        }
      }}
    />
  );
}
