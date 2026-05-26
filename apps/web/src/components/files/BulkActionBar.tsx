"use client";

import { motion, AnimatePresence } from "motion/react";
import { Button } from "@vmem/ui";
import { motionEase, motionDuration } from "@vmem/ui";
import {
  IconDownload,
  IconFolderSymlink,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

interface BulkActionBarProps {
  selectedCount: number;
  onDownload: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export default function BulkActionBar({
  selectedCount,
  onDownload,
  onMove,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
          className="flex items-center gap-2 rounded-xl bg-surface-secondary/80 px-4 py-2"
        >
          <span className="text-sm font-medium text-foreground tabular-nums mr-2">
            {selectedCount} selected
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={onDownload}
            className="text-muted"
          >
            <IconDownload size={15} stroke={1.5} />
            Download
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onMove}
            className="text-muted"
          >
            <IconFolderSymlink size={15} stroke={1.5} />
            Move
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-danger hover:text-danger"
          >
            <IconTrash size={15} stroke={1.5} />
            Delete
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClear}
            className="text-muted ml-auto"
          >
            <IconX size={15} stroke={1.5} />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
