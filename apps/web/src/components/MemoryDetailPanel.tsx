"use client";

import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vmem/ui";
import {
  IconLoader2,
  IconTrash,
  IconX,
  IconDots,
  IconPencil,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import type { Memory } from "@/lib/memories";
import { formatMemoryTypeLabel } from "@/lib/memories";
import {
  countUniqueRelated,
  relatedMemoriesQueryKey,
  uniqueRelated,
} from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { toast } from "sonner";
import { DetailsTabView, DetailsTabEdit } from "./_components/DetailsTab";
import HistoryTab from "./_components/HistoryTab";
import ConnectionsTab from "./_components/ConnectionsTab";
import { MemorySourceLabel } from "./_components/MemorySourceLabel";

type PanelTab = "details" | "history" | "connections";

const TAB_PANEL_CLASS =
  "mt-3 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin";

function formatMetaDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface MemoryDetailPanelProps {
  memory: Memory;
  onClose: () => void;
  onMemoryDelete: (id: string) => void;
  onSelectRelated: (memory: Memory) => void;
  // one-shot action to run when the panel opens (edit or delete confirm)
  initialAction?: "edit" | "delete";
  onConsumeAction?: () => void;
}

export default function MemoryDetailPanel({
  memory,
  onClose,
  onMemoryDelete,
  onSelectRelated,
  initialAction,
  onConsumeAction,
}: MemoryDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("details");
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { deleteMemory } = useMemoryContext();
  const getRelatedMemories = useAction(api.relationshipApi.getRelatedMemories);
  const relatedQuery = useTanstackQuery({
    queryKey: relatedMemoriesQueryKey(memory.id),
    queryFn: async () => {
      const data = await getRelatedMemories({ memoryId: memory.id });
      return uniqueRelated(data);
    },
  });
  const connectionCount =
    relatedQuery.data === undefined
      ? null
      : countUniqueRelated(relatedQuery.data);

  useEffect(() => {
    if (initialAction === "edit") {
      setIsEditing(true);
      setActiveTab("details");
      onConsumeAction?.();
    } else if (initialAction === "delete") {
      setShowDeleteConfirm(true);
      onConsumeAction?.();
    }
  }, [initialAction, onConsumeAction]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !showDeleteConfirm && !isEditing) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: true });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, showDeleteConfirm, isEditing]);

  async function handleDelete() {
    setIsDeleting(true);

    try {
      const deleted = await deleteMemory(memory.id);
      if (!deleted) {
        throw new Error("Memory not found");
      }

      onMemoryDelete(memory.id);
      setShowDeleteConfirm(false);
      onClose();
      toast.success("Memory deleted successfully");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete memory",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function handleStartEdit() {
    setActiveTab("details");
    setIsEditing(true);
  }

  return (
    <>
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="mb-3 shrink-0">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-semibold leading-snug text-foreground">
                {memory.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <time className="tabular-nums text-foreground/80">
                  {formatMetaDate(memory.createdAt)}
                </time>
                <span aria-hidden>·</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  {formatMemoryTypeLabel(memory.type)}
                </Badge>
                <span aria-hidden>·</span>
                <MemorySourceLabel
                  source={memory.source}
                  size={12}
                  labelClassName="text-foreground/80"
                />
              </div>
            </div>
            {!isEditing ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted"
                    aria-label="Memory actions"
                  >
                    <IconDots size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={handleStartEdit}>
                    <IconPencil size={14} />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger focus:text-danger data-[highlighted]:text-danger"
                    onSelect={() => setShowDeleteConfirm(true)}
                  >
                    <IconTrash size={14} />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="shrink-0 text-muted"
              aria-label="Close panel"
            >
              <IconX size={18} />
            </Button>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            if (v === "details" || v === "history" || v === "connections") {
              setActiveTab(v);
            }
          }}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <TabsList className="max-w-full shrink-0 self-start">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="connections">
              Connections
              {connectionCount !== null && connectionCount > 0 ? (
                <span className="ml-1 tabular-nums text-muted">
                  ({connectionCount})
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className={TAB_PANEL_CLASS}>
            {isEditing ? (
              <DetailsTabEdit
                key={memory.id}
                memory={memory}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <DetailsTabView memory={memory} />
            )}
          </TabsContent>

          <TabsContent value="history" className={TAB_PANEL_CLASS}>
            <HistoryTab key={memory.id} memoryId={memory.id} />
          </TabsContent>

          <TabsContent value="connections" className={TAB_PANEL_CLASS}>
            <ConnectionsTab
              memoryId={memory.id}
              onSelectRelated={onSelectRelated}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(value) => {
          if (!value) setShowDeleteConfirm(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader className="pb-5">
            <DialogTitle className="text-foreground">Delete Memory</DialogTitle>
          </DialogHeader>
          <p className="text-muted py-2">
            Are you sure you want to delete &quot;{memory.title}&quot;? This
            action cannot be undone.
          </p>
          <DialogFooter className="pt-5">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="text-muted"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconTrash size={16} />
              )}
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
