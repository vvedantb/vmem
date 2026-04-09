"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { Badge, Button } from "@vmem/ui";
import { IconLink, IconLoader2, IconUnlink } from "@tabler/icons-react";
import { toast } from "sonner";
import { clientEnv } from "@/env/client";
import type { Memory, MemoryType } from "@/lib/memories";
import LinkMemoryModal from "@/components/LinkMemoryModal";

const API_URL = clientEnv.NEXT_PUBLIC_API_URL;

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
  const { getToken } = useAuth();
  const [entries, setEntries] = useState<RelatedMemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const token = await getToken();
      const headers = new Headers(init?.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(url, { ...init, headers });
    },
    [getToken],
  );

  const fetchRelated = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(
        `${API_URL}/v1/relationships/memory/${memoryId}`,
      );
      if (res.ok) {
        const json: { data: RelatedMemoryEntry[] } = await res.json();
        const seen = new Set<string>();
        const unique = json.data.filter((entry) => {
          if (seen.has(entry.memory.id)) return false;
          seen.add(entry.memory.id);
          return true;
        });
        setEntries(unique);
      }
    } catch {
      setEntries([]);
    }
    setIsLoading(false);
  }, [memoryId, authFetch]);

  useEffect(() => {
    fetchRelated();
  }, [fetchRelated]);

  const handleUnlink = useCallback(
    async (relatedId: string) => {
      setUnlinkingId(relatedId);
      try {
        const res = await authFetch(`${API_URL}/v1/relationships/link`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memoryIdA: memoryId,
            memoryIdB: relatedId,
          }),
        });
        if (res.ok) {
          setEntries((prev) =>
            prev.filter((entry) => entry.memory.id !== relatedId),
          );
          toast.success("Memory unlinked");
        } else {
          toast.error("Failed to unlink memory");
        }
      } catch {
        toast.error("Failed to unlink memory");
      }
      setUnlinkingId(null);
    },
    [memoryId, authFetch],
  );

  const relatedIds = useMemo(
    () => new Set(entries.map((e) => e.memory.id)),
    [entries],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Related Memories
          </h4>
          {entries.length > 0 && (
            <Badge
              variant="outline"
              className="bg-muted border-border text-muted-foreground text-xs"
            >
              {entries.length}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLinkModalOpen(true)}
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          <IconLink size={14} />
          Link
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-3">
          <IconLoader2
            size={16}
            className="animate-spin text-muted-foreground"
          />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No related memories</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.memory.id}
              className="flex items-start justify-between gap-2 rounded-lg bg-muted/50 border border-border p-2.5"
            >
              <button
                type="button"
                onClick={() =>
                  onSelectRelated({
                    id: entry.memory.id,
                    title: entry.memory.title,
                    content: entry.memory.content,
                    type: toMemoryType(entry.memory.type),
                    tags: entry.memory.tags,
                    createdAt: entry.memory.createdAt,
                  })
                }
                className="flex-1 text-left min-w-0"
              >
                <p className="text-sm font-medium text-foreground truncate">
                  {entry.memory.title}
                </p>
                <Badge
                  variant="outline"
                  className="mt-1 text-xs bg-muted border-border text-muted-foreground"
                >
                  {entry.reason}
                </Badge>
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleUnlink(entry.memory.id)}
                disabled={unlinkingId === entry.memory.id}
                className="flex-shrink-0 text-muted-foreground hover:text-destructive"
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
