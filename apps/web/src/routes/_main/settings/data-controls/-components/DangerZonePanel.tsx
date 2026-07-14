"use client";

import { useState } from "react";
import { Button, Card, CardContent } from "@vmem/ui";
import { IconAlertTriangle, IconTrash } from "@tabler/icons-react";
import DeleteAllMemoriesDialog from "./DeleteAllMemoriesDialog";

// body of the Data Control tab
export function DangerZonePanel() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <IconAlertTriangle size={20} className="text-danger" stroke={1.75} />
          <h3 className="text-base font-medium text-foreground text-balance">
            Delete all memories
          </h3>
        </div>
        <Card className="shadow-none">
          <CardContent className="p-6">
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
          </CardContent>
        </Card>
      </section>

      <DeleteAllMemoriesDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
