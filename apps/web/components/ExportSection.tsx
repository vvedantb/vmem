"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { IconDownload } from "@tabler/icons-react";
import ExportModal from "./ExportModal";

export default function ExportSection() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="p-8 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
        <h3 className="text-lg font-medium mb-2 text-black dark:text-white">
          Data Export
        </h3>
        <p className="text-sm text-neutral-500 mb-6">
          Export your memories to JSON or CSV format for backup or migration.
        </p>
        <Button
          onPress={() => setIsModalOpen(true)}
          className="bg-black dark:bg-white text-white dark:text-black"
          startContent={<IconDownload size={18} />}
        >
          Export Memories
        </Button>
      </div>

      <ExportModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
