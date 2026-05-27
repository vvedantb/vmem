"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAction } from "convex/react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@vmem/ui";
import {
  IconAlertTriangle,
  IconLink,
  IconLoader2,
  IconUnlink,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import type { Memory, MemoryType } from "@/lib/memories";
import LinkMemoryModal from "@/components/LinkMemoryModal";
import { DetailEmptyState } from "./detail-panel/DetailEmptyState";
import { VmemSpinner } from "@/components/svg-animations";

function isMemoryType(value: string): value is MemoryType {
  return value === "profile" || value === "episodic" || value === "knowledge";
}

function toMemoryType(value: string): MemoryType {
  return isMemoryType(value) ? value : "knowledge";
}

interface RelatedMemoryEntry {
  memory: {
    id: string;
    title: string;
    content: string;
    type: string;
    source?: string;
    sourceUrl?: string | null;
    sourceSyncedAt?: string | null;
    tags: string[];
    createdAt: string;
  };
  reason: string;
}

interface RelatedMemoriesProps {
  memoryId: string;
  onSelectRelated: (memory: Memory) => void;
}

export default function RelatedMemories({
  memoryId,
  onSelectRelated,
}: RelatedMemoriesProps) {
  const getRelatedMemories = useAction(api.relationshipApi.getRelatedMemories);
  const unlinkMemoriesAction = useAction(api.relationshipApi.unlinkMemories);
  const [entries, setEntries] = useState<RelatedMemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const fetchRelated = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getRelatedMemories({ memoryId });
      const entries = data as RelatedMemoryEntry[];
      const seen = new Set<string>();
      const unique = entries.filter((entry) => {
        if (seen.has(entry.memory.id)) return false;
        seen.add(entry.memory.id);
        return true;
      });
      setEntries(unique);
    } catch {
      setEntries([]);
    }
    setIsLoading(false);
  }, [memoryId, getRelatedMemories]);

  useEffect(() => {
    fetchRelated();
  }, [fetchRelated]);

  const handleUnlink = useCallback(
    async (relatedId: string) => {
      setUnlinkingId(relatedId);
      try {
        await unlinkMemoriesAction({
          memoryIdA: memoryId,
          memoryIdB: relatedId,
        });
        setEntries((prev) =>
          prev.filter((entry) => entry.memory.id !== relatedId),
        );
        toast.success("Memory unlinked");
      } catch {
        toast.error("Failed to unlink memory");
      }
      setUnlinkingId(null);
    },
    [memoryId, unlinkMemoriesAction],
  );

  const relatedIds = useMemo(
    () => new Set(entries.map((e) => e.memory.id)),
    [entries],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Related memories
          </h4>
          {entries.length > 0 ? (
            <Badge variant="secondary" className="text-xs tabular-nums">
              {entries.length}
            </Badge>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLinkModalOpen(true)}
          className="h-8 gap-1.5"
        >
          <IconLink size={14} />
          Link memory
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center rounded-lg bg-surface-secondary py-12">
          <VmemSpinner size={20} className="text-muted" />
        </div>
      ) : entries.length === 0 ? (
        <DetailEmptyState
          icon={IconLink}
          title="No connections yet"
          description="Link related memories to build a graph of how ideas connect."
          action={
            <Button size="sm" onClick={() => setLinkModalOpen(true)}>
              <IconLink size={14} />
              Link a memory
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <div
              key={entry.memory.id}
              className="flex items-start gap-2 rounded-lg bg-surface-secondary p-3 transition-[background-color] hover:bg-surface-tertiary"
            >
              <button
                type="button"
                onClick={() =>
                  onSelectRelated({
                    id: entry.memory.id,
                    title: entry.memory.title,
                    content: entry.memory.content,
                    type: toMemoryType(entry.memory.type),
                    source: entry.memory.source ?? "web",
                    sourceUrl: entry.memory.sourceUrl ?? null,
                    sourceSyncedAt: entry.memory.sourceSyncedAt ?? null,
                    tags: entry.memory.tags,
                    createdAt: entry.memory.createdAt,
                  })
                }
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {entry.memory.title}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                  {entry.memory.content}
                </p>
                <Badge variant="secondary" className="mt-2 text-[10px]">
                  {entry.reason}
                </Badge>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmUnlinkId(entry.memory.id)}
                disabled={unlinkingId === entry.memory.id}
                className="shrink-0 text-muted hover:bg-danger/10 hover:text-danger"
                aria-label={`Unlink ${entry.memory.title}`}
              >
                {unlinkingId === entry.memory.id ? (
                  <IconLoader2 size={14} className="animate-spin" />
                ) : (
                  <IconUnlink size={14} />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={confirmUnlinkId !== null}
        onOpenChange={(open) => {
          if (!open && unlinkingId === null) setConfirmUnlinkId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Unlink memory</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm unlinking a related memory
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger/10">
              <IconAlertTriangle size={20} className="text-danger" />
            </div>
            <div>
              <p className="text-foreground">
                Unlink{" "}
                <span className="font-medium">
                  {entries.find((e) => e.memory.id === confirmUnlinkId)?.memory
                    .title ?? "this memory"}
                </span>
                ?
              </p>
              <p className="mt-1 text-sm text-muted">
                This removes the relationship between these two memories.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmUnlinkId(null)}
              disabled={unlinkingId !== null}
              className="text-muted"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (confirmUnlinkId === null) return;
                await handleUnlink(confirmUnlinkId);
                setConfirmUnlinkId(null);
              }}
              disabled={unlinkingId !== null}
            >
              {unlinkingId !== null ? (
                <>
                  <IconLoader2 size={16} className="animate-spin" />
                  Unlinking...
                </>
              ) : (
                "Unlink"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LinkMemoryModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        currentMemoryId={memoryId}
        excludeIds={relatedIds}
        onLinked={fetchRelated}
      />
    </div>
  );
}
