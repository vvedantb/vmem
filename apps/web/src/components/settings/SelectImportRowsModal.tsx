"use client";

import { useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import type { ExportImportRow } from "@/lib/chat-export/importRows";

type SelectImportRowsModalProps = {
  open: boolean;
  rows: ExportImportRow[];
  onClose: () => void;
  onConfirm: (selected: ExportImportRow[]) => void;
  isImporting: boolean;
};

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export default function SelectImportRowsModal({
  open,
  rows,
  onClose,
  onConfirm,
  isImporting,
}: SelectImportRowsModalProps) {
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(rows.map((r) => r.stableId)),
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(rows.map((r) => r.stableId)));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = () => {
    const chosen = rows.filter((r) => selectedIds.has(r.stableId));
    if (chosen.length === 0) return;
    onConfirm(chosen);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Choose conversations to import
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 text-sm">
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm active:scale-100"
            onClick={selectAll}
          >
            Select all
          </Button>
          <span className="text-muted">·</span>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm active:scale-100"
            onClick={selectNone}
          >
            Select none
          </Button>
        </div>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {rows.map((row) => (
            <li
              key={row.stableId}
              className="flex gap-3 rounded-lg bg-surface-secondary/50 px-3 py-2.5"
            >
              <Checkbox
                checked={selectedIds.has(row.stableId)}
                onCheckedChange={() => toggle(row.stableId)}
                disabled={isImporting}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {row.title}
                </p>
                <p className="text-xs text-muted">
                  {wordCount(row.content)} words
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 border-t border-separator pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isImporting || selectedIds.size === 0}
          >
            {isImporting ? "Importing…" : "Import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
