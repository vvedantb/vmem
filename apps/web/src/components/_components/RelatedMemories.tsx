import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import {
  useMutation,
  useQuery as useTanstackQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
import type { Memory } from "@/lib/memories";
import { formatMemoryTypeLabel, memoryFromApi } from "@/lib/memories";
import {
  relatedMemoriesQueryKey,
  uniqueRelated,
  type RelatedMemoryEntry,
} from "@/lib/memories";
import LinkMemoryModal from "@/components/memories/LinkMemoryModal";
import { DetailEmptyState } from "./detail-panel/DetailEmptyState";
import { VmemSpinner } from "@/components/icons/animations";

interface RelatedMemoriesProps {
  memoryId: string;
  onSelectRelated: (memory: Memory) => void;
}

export default function RelatedMemories({
  memoryId,
  onSelectRelated,
}: RelatedMemoriesProps) {
  const queryClient = useQueryClient();
  const getRelatedMemories = useAction(api.relationshipApi.getRelatedMemories);
  const unlinkMemoriesAction = useAction(api.relationshipApi.unlinkMemories);
  const queryKey = relatedMemoriesQueryKey(memoryId);
  const relatedQuery = useTanstackQuery({
    queryKey,
    queryFn: async (): Promise<RelatedMemoryEntry[]> => {
      const data = await getRelatedMemories({ memoryId });
      return uniqueRelated(data);
    },
  });
  const entries = relatedQuery.data ?? [];
  const isLoading = relatedQuery.isLoading;
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const unlinkMutation = useMutation({
    mutationFn: async (relatedId: string) => {
      await unlinkMemoriesAction({
        memoryIdA: memoryId,
        memoryIdB: relatedId,
      });
      return relatedId;
    },
    onMutate: async (relatedId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<RelatedMemoryEntry[]>(queryKey);
      queryClient.setQueryData<RelatedMemoryEntry[]>(queryKey, (old) =>
        old ? old.filter((entry) => entry.memory.id !== relatedId) : [],
      );
      return { previous };
    },
    onError: (_err, _relatedId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleUnlink = useCallback(
    async (relatedId: string) => {
      setUnlinkingId(relatedId);
      try {
        await unlinkMutation.mutateAsync(relatedId);
        toast.success("Memory unlinked");
      } catch {
        toast.error("Failed to unlink memory");
      }
      setUnlinkingId(null);
    },
    [unlinkMutation],
  );

  const invalidateRelated = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const relatedIds = new Set(entries.map((entry) => entry.memory.id));
  const unlinkTarget =
    confirmUnlinkId === null
      ? null
      : (entries.find((entry) => entry.memory.id === confirmUnlinkId) ?? null);

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="text-xs font-medium text-muted">Related memories</h4>
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
          className="h-8 shrink-0 gap-1.5"
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
        <div className="flex flex-col gap-0.5">
          {entries.map((entry) => {
            const related = memoryFromApi(entry.memory);
            return (
              <div
                key={entry.memory.id}
                className="flex min-w-0 items-start gap-1 rounded-lg px-2 py-2.5 transition-[background-color] hover:bg-surface-tertiary"
              >
                <button
                  type="button"
                  onClick={() => onSelectRelated(related)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-2 overflow-hidden rounded-none border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <div className="min-w-0 w-full overflow-hidden">
                    <p className="truncate text-sm font-medium text-foreground">
                      {entry.memory.title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 break-all text-xs leading-relaxed text-muted">
                      {entry.memory.content}
                    </p>
                  </div>
                  <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-1.5">
                    <Badge
                      variant="secondary"
                      className="h-5 max-w-full truncate text-[10px]"
                    >
                      {entry.reason}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="h-5 shrink-0 text-[10px] font-normal"
                    >
                      {formatMemoryTypeLabel(related.type)}
                    </Badge>
                  </div>
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
            );
          })}
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
                  {unlinkTarget?.memory.title ?? "this memory"}
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
        onLinked={invalidateRelated}
      />
    </div>
  );
}
