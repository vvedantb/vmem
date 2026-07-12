"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/formatters";

interface SkillHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillId: Id<"skills"> | null;
}

/**
 * Version history for a skill: a list of pre-overwrite snapshots, a read-only
 * preview of the selected one, and Restore. Restore checkpoints the current
 * state first (server-side), so it is reversible.
 */
export function SkillHistoryPanel({
  open,
  onOpenChange,
  skillId,
}: SkillHistoryPanelProps) {
  const versions = useQuery(
    api.skillVersions.list,
    open && skillId ? { skillId } : "skip",
  );
  const [selectedId, setSelectedId] = useState<Id<"skillVersions"> | null>(
    null,
  );
  const [restoring, setRestoring] = useState(false);

  const selected = useQuery(
    api.skillVersions.get,
    selectedId ? { versionId: selectedId } : "skip",
  );
  const restoreVersion = useMutation(api.skills.restoreVersion);

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

  const handleRestore = async () => {
    if (!selectedId) return;
    setRestoring(true);
    try {
      await restoreVersion({ versionId: selectedId });
      toast.success("Version restored");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
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
                  No versions yet. A version is saved before the skill is
                  changed after a break, or whenever an agent edits it.
                </p>
              </div>
            ) : (
              versions.map((ver) => (
                <Button
                  key={ver._id}
                  type="button"
                  variant="ghost"
                  onClick={() => setSelectedId(ver._id)}
                  className={`flex h-auto w-full flex-col items-start gap-1 rounded-md px-2.5 py-2 text-left ${
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
                </Button>
              ))
            )}
          </div>

          {/* Preview */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto rounded-lg bg-surface-secondary/40 px-4 py-3 scrollbar-thin">
            {selected === undefined && selectedId !== null ? (
              <div className="flex flex-1 items-center justify-center">
                <IconLoader2 size={16} className="animate-spin text-muted" />
              </div>
            ) : selected ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  {selected.name}
                </p>
                {selected.description ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted">
                      Description
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {selected.description}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted">Instructions</p>
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
                    {selected.instructions}
                  </pre>
                </div>
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
