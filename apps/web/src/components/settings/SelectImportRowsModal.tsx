"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import type { ExportImportRow } from "../_utils/importRows";

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set(rows.map((r) => r.stableId)));
  }, [rows]);

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
          <button
            type="button"
            className="text-accent underline-offset-4 hover:underline"
            onClick={selectAll}
          >
            Select all
          </button>
          <span className="text-muted">·</span>
          <button
            type="button"
            className="text-accent underline-offset-4 hover:underline"
            onClick={selectNone}
          >
            Select none
          </button>
        </div>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {rows.map((row) => (
            <li
              key={row.stableId}
              className="flex gap-3 rounded-lg border border-border px-3 py-2.5"
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
        <div className="flex justify-end gap-2 border-t border-border pt-3">
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
