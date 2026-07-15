import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { toast } from "sonner";
import { BulkSelectionDeleteBar } from "@/components/BulkSelectionDeleteBar";
import { optimisticDeleteSkillsFromList } from "@/components/skills/_optimisticMutations";

interface SkillBulkDeleteBarProps {
  selectedIds: ReadonlySet<Id<"skills">>;
  teamId: Id<"teams"> | undefined;
  // clear the selection and leave select mode
  onExit: () => void;
}

// selection-mode action bar for the skills sidebar
export function SkillBulkDeleteBar({
  selectedIds,
  teamId,
  onExit,
}: SkillBulkDeleteBarProps) {
  const deleteSkills = useMutation(
    api.skills.deleteSkills,
  ).withOptimisticUpdate((localStore, args) =>
    optimisticDeleteSkillsFromList(localStore, teamId, args),
  );

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
