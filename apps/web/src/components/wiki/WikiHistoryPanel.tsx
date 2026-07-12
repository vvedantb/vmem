"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import { IconHistory, IconLoader2 } from "@tabler/icons-react";
import { formatRelativeTime } from "@/lib/formatters";
import { wikiEditorExtensions } from "./_editorExtensions";

interface WikiHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docId: Id<"wikiNodes"> | null;
  /** Loads the chosen version's markdown into the open editor and persists it. */
  onRestore: (markdown: string) => Promise<void>;
}

/**
 * Version history for a wiki document: a list of pre-overwrite snapshots, a
 * read-only preview of the selected one, and Restore. Restore is reversible —
 * the editor checkpoints the current state before loading the old content.
 */
export function WikiHistoryPanel({
  open,
  onOpenChange,
  docId,
  onRestore,
}: WikiHistoryPanelProps) {
  const versions = useQuery(
    api.wikiVersions.list,
    open && docId ? { nodeId: docId } : "skip",
  );
  const [selectedId, setSelectedId] = useState<Id<"wikiNodeVersions"> | null>(
    null,
  );
  const [restoring, setRestoring] = useState(false);

  const selected = useQuery(
    api.wikiVersions.get,
    selectedId ? { versionId: selectedId } : "skip",
  );

  // Default to the newest version when the list (re)loads; reset when closed.
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      return;
    }
    if (!versions || versions.length === 0) return;
    if (selectedId && versions.some((v) => v._id === selectedId)) return;
    const newest = versions.at(0);
    if (newest) setSelectedId(newest._id);
  }, [open, versions, selectedId]);

  const previewEditor = useEditor({
    extensions: wikiEditorExtensions(),
    content: "",
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "max-w-none focus:outline-none text-sm" },
    },
  });

  useEffect(() => {
    if (!previewEditor) return;
    previewEditor.commands.setContent(selected ? selected.content : "");
  }, [previewEditor, selected]);

  const handleRestore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      await onRestore(selected.content);
      onOpenChange(false);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(80vh,640px)] max-w-3xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-3">
          {/* Version list */}
          <div className="flex w-56 shrink-0 flex-col overflow-y-auto rounded-lg bg-surface-secondary/40 p-1 scrollbar-thin">
            {versions === undefined ? (
              <div className="flex flex-1 items-center justify-center">
                <IconLoader2 size={16} className="animate-spin text-muted" />
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-6 text-center">
                <IconHistory size={24} className="text-muted" />
                <p className="text-xs text-muted">
                  No versions yet. A version is saved before the document is
                  changed after a break, or whenever an agent edits it.
                </p>
              </div>
            ) : (
              versions.map((ver) => (
                <button
                  key={ver._id}
                  type="button"
                  onClick={() => setSelectedId(ver._id)}
                  className={`flex flex-col items-start gap-1 rounded-md px-2.5 py-2 text-left transition-[background-color] ${
                    ver._id === selectedId
                      ? "bg-surface-tertiary"
                      : "hover:bg-surface-tertiary/50"
                  }`}
                >
                  <span className="text-xs font-medium text-foreground">
                    {formatRelativeTime(ver.createdAt)}
                  </span>
                  <Badge
                    variant={ver.source === "mcp" ? "default" : "outline"}
                    className="h-4 px-1.5 text-[10px] font-normal"
                  >
                    {ver.authorLabel}
                  </Badge>
                </button>
              ))
            )}
          </div>

          {/* Preview */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-lg bg-surface-secondary/40 px-4 py-3 scrollbar-thin">
            {selected === undefined && selectedId !== null ? (
              <div className="flex flex-1 items-center justify-center">
                <IconLoader2 size={16} className="animate-spin text-muted" />
              </div>
            ) : selected ? (
              <>
                <p className="mb-2 text-sm font-medium text-foreground">
                  {selected.title}
                </p>
                <EditorContent editor={previewEditor} />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted">
                  Select a version to preview
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selected || restoring}
            onClick={() => void handleRestore()}
          >
            {restoring ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : null}
            Restore this version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
