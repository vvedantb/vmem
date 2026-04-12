"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Card,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@vmem/ui";
import { IconTrash, IconLoader2, IconX } from "@tabler/icons-react";
import type { Memory } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { toast } from "sonner";
import DetailsTab from "./_components/DetailsTab";
import HistoryTab from "./_components/HistoryTab";
import ConnectionsTab from "./_components/ConnectionsTab";

type PanelTab = "details" | "history" | "connections";

interface MemoryDetailPanelProps {
  memory: Memory;
  onClose: () => void;
  onMemoryUpdate: (memory: Memory) => void;
  onMemoryDelete: (id: string) => void;
  onSelectRelated: (memory: Memory) => void;
  startInEditMode?: boolean;
  startWithDelete?: boolean;
  onConsumeAction?: () => void;
}

export default function MemoryDetailPanel({
  memory,
  onClose,
  onMemoryUpdate,
  onMemoryDelete,
  onSelectRelated,
  startInEditMode = false,
  startWithDelete = false,
  onConsumeAction,
}: MemoryDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("details");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { deleteMemory } = useMemoryContext();

  const handleDelete = useCallback(async () => {
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
  }, [memory, onMemoryDelete, onClose, deleteMemory]);

  const handleRequestDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  return (
    <>
      <Card className="p-4 sm:p-5 lg:sticky lg:top-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-foreground flex-1">
            {memory.title}
          </h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground flex-shrink-0"
          >
            <IconX size={18} />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as PanelTab)}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <DetailsTab
              memory={memory}
              onMemoryUpdate={onMemoryUpdate}
              onRequestDelete={handleRequestDelete}
              onSelectRelated={onSelectRelated}
              startInEditMode={startInEditMode}
              startWithDelete={startWithDelete}
              onConsumeAction={onConsumeAction}
            />
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab memoryId={memory.id} />
          </TabsContent>

          <TabsContent value="connections">
            <ConnectionsTab
              memoryId={memory.id}
              onSelectRelated={onSelectRelated}
            />
          </TabsContent>
        </Tabs>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(value) => {
          if (!value) setShowDeleteConfirm(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-foreground">Delete Memory</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2">
            Are you sure you want to delete &quot;{memory.title}&quot;? This
            action cannot be undone.
          </p>
          <DialogFooter className="border-t border-border pt-4">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="text-muted-foreground"
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
