"use client";

import { useState } from "react";
import { Button } from "@vmem/ui";
import { IconDownload } from "@tabler/icons-react";
import ExportModal from "./ExportModal";

export default function ExportSection() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="p-8 rounded-xl border border-border bg-muted/50">
        <h3 className="text-lg font-medium mb-2 text-foreground">
          Data Export
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Export your memories to JSON or CSV format for backup or migration.
        </p>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary text-primary-foreground"
        >
          <IconDownload size={18} />
          Export Memories
        </Button>
      </div>

      <ExportModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
