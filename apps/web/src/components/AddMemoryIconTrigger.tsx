import { IconPlus } from "@tabler/icons-react";
import { Button } from "@vmem/ui";
import AddMemoryModal from "@/components/AddMemoryModal";

// shared icon-sm AddMemoryModal trigger used by graph + list header chrome
export default function AddMemoryIconTrigger({
  className,
}: {
  className?: string;
}) {
  return (
    <AddMemoryModal
      trigger={
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Add memory"
          className={className}
        >
          <IconPlus size={16} />
        </Button>
      }
    />
  );
}
