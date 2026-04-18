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
import { Virtuoso } from "react-virtuoso";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import { useMemoryContext } from "@/components/contexts/MemoryContext";

const TAGS_PREVIEW = 3;
const ROW_HEIGHT = 70;

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

        {filteredMemories.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No memories to link
          </p>
        ) : (
          <Virtuoso
            data={filteredMemories}
            computeItemKey={(_index, memory) => memory.id}
            defaultItemHeight={ROW_HEIGHT}
            itemContent={(_index, memory) => (
              <div className="pb-1.5">
                <button
                  type="button"
                  disabled={linkingId !== null}
                  onClick={() => handleLink(memory.id)}
                  className="w-full h-[64px] text-left px-2.5 py-1 rounded-lg hover:bg-accent transition-colors disabled:opacity-50 flex flex-col justify-center gap-1 min-w-0"
                >
                  <div className="flex items-center gap-2 min-h-0">
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
                  {memory.tags.length > 0 ? (
                    <div className="flex gap-1 flex-nowrap overflow-hidden min-h-[1.25rem]">
                      {memory.tags.slice(0, TAGS_PREVIEW).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="bg-muted border-border text-muted-foreground text-xs shrink-0 max-w-[40%] truncate"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {memory.tags.length > TAGS_PREVIEW ? (
                        <Badge
                          variant="outline"
                          className="bg-muted border-border text-muted-foreground text-xs shrink-0"
                        >
                          +{memory.tags.length - TAGS_PREVIEW}
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              </div>
            )}
            style={{ height: 256 }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
