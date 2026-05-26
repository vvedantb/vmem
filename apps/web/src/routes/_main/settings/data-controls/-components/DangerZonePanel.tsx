"use client";

import { useState } from "react";
import { Button } from "@vmem/ui";
import { IconAlertTriangle, IconTrash } from "@tabler/icons-react";
import DeleteAllMemoriesDialog from "./DeleteAllMemoriesDialog";

/**
 * Body of the Data Control tab. Hosts every irreversible operation the
 * user can run on their own data. Each row is its own card so additional
 * destructive actions (e.g. delete account, reset relationships only)
 * can drop in without restructuring.
 */
export function DangerZonePanel() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div className="rounded-lg bg-surface-secondary/40 p-6">
        <div className="mb-4 flex items-center gap-3">
          <IconAlertTriangle size={20} className="text-danger" stroke={1.75} />
          <h3 className="text-base font-medium text-foreground">
            Delete all memories
          </h3>
        </div>
        <p className="mb-5 text-sm text-muted">
          Permanently removes every memory you own, along with their tags,
          relationships, chunks, and history. This action cannot be undone.
        </p>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
        >
          <IconTrash size={16} />
          Delete all memories
        </Button>
      </div>

      <DeleteAllMemoriesDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
