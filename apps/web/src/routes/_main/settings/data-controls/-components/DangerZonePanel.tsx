import { useState } from "react";
import { Button } from "@vmem/ui";
import { IconAlertTriangle, IconTrash } from "@tabler/icons-react";
import DeleteAllMemoriesDialog from "./DeleteAllMemoriesDialog";
import { SettingsSection } from "@/components/settings/SettingsSection";

export function DangerZonePanel() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <SettingsSection
        title={
          <span className="inline-flex items-center gap-2">
            <IconAlertTriangle
              size={16}
              className="text-danger"
              stroke={1.75}
            />
            Delete all memories
          </span>
        }
        description="Permanently removes every memory you own, along with their tags, relationships, chunks, and history. This action cannot be undone."
      >
        <Button
          type="button"
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
        >
          <IconTrash size={16} />
          Delete all memories
        </Button>
      </SettingsSection>

      <DeleteAllMemoriesDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
