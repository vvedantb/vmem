"use client";

import { useState, useMemo, useCallback } from "react";
import { useAction } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Badge,
} from "@vmem/ui";
import { IconSearch, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import { useMemoryContext } from "@/components/contexts/MemoryContext";

interface LinkMemoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMemoryId: string;
  excludeIds: Set<string>;
  onLinked: () => void;
}

export default function LinkMemoryModal({
  open,
  onOpenChange,
  currentMemoryId,
  excludeIds,
  onLinked,
}: LinkMemoryModalProps) {
  const linkMemories = useAction(api.relationshipApi.linkMemories);
  const { memories } = useMemoryContext();
  const [search, setSearch] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const filteredMemories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return memories.filter((m) => {
      if (m.id === currentMemoryId) return false;
      if (excludeIds.has(m.id)) return false;
      if (!query) return true;
      return (
        m.title.toLowerCase().includes(query) ||
        m.tags.some((t) => t.toLowerCase().includes(query))
      );
    });
  }, [memories, currentMemoryId, excludeIds, search]);

  const handleLink = useCallback(
    async (selectedId: string) => {
      setLinkingId(selectedId);
      try {
        await linkMemories({
          memoryIdA: currentMemoryId,
          memoryIdB: selectedId,
          reason: "user linked",
        });
        toast.success("Memory linked");
        onLinked();
        onOpenChange(false);
        setSearch("");
      } catch {
        toast.error("Failed to link memory");
      }
      setLinkingId(null);
    },
    [currentMemoryId, linkMemories, onLinked, onOpenChange],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) setSearch("");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-foreground">Link Memory</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <IconSearch
              className="text-muted-foreground"
              size={16}
              stroke={1.5}
            />
          </div>
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="h-9 bg-muted/50 border-border pl-9 text-foreground hover:bg-accent focus-visible:border-ring"
          />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 py-1">
          {filteredMemories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No memories to link
            </p>
          ) : (
            filteredMemories.map((memory) => (
              <button
                key={memory.id}
                type="button"
                disabled={linkingId !== null}
                onClick={() => handleLink(memory.id)}
                className="w-full text-left p-2.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate flex-1">
                    {memory.title}
                  </p>
                  {linkingId === memory.id && (
                    <IconLoader2
                      size={14}
                      className="animate-spin text-muted-foreground flex-shrink-0"
                    />
                  )}
                </div>
                {memory.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {memory.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="bg-muted border-border text-muted-foreground text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
