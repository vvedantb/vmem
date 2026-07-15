import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import {
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
import { formatDate } from "@vmem/shared";
import { IconTrash, IconX, IconDots, IconPencil } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import type { Memory } from "@/lib/memories";
import { formatMemoryTypeLabel } from "@/lib/memories";
import {
  countUniqueRelated,
  relatedMemoriesQueryKey,
  uniqueRelated,
} from "@/lib/memories";
import { useMemoryContext } from "@/contexts/MemoryContext";
import { toast } from "sonner";
import {
  DetailsTabView,
  DetailsTabEdit,
} from "@/components/_components/DetailsTab";
import HistoryTab from "@/components/_components/HistoryTab";
import RelatedMemories from "@/components/_components/RelatedMemories";
import { MemorySourceLabel } from "@/components/_components/MemorySourceLabel";
import DestructiveConfirmDialog from "@/components/settings/DestructiveConfirmDialog";

type PanelTab = "details" | "history" | "connections";

const TAB_PANEL_CLASS =
  "mt-3 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin";

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
                  {formatDate(memory.createdAt)}
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
            <RelatedMemories
              memoryId={memory.id}
              onSelectRelated={onSelectRelated}
            />
          </TabsContent>
        </Tabs>
      </div>

      <DestructiveConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Memory"
        description="This action cannot be undone."
        confirmLabel="Delete"
        submittingLabel="Deleting..."
        submitting={isDeleting}
        onConfirm={() => {
          void handleDelete();
        }}
      >
        Are you sure you want to delete &quot;{memory.title}&quot;?
      </DestructiveConfirmDialog>
    </>
  );
}
