"use client";

import { Link } from "@tanstack/react-router";
import { IconBrain } from "@tabler/icons-react";
import type { FileItem } from "@/lib/file-types";
import { useActiveProfile } from "@/components/workspace/active-profile";

/**
 * Memory-graph indexing indicator for a file row/card. Indexed files link to
 * the derived memory; failed files show a muted hint. Pending/skipped render
 * nothing — uploads resolve within seconds and non-text files are expected
 * to skip, so neither state is worth pixels.
 */
export default function MemoryIndexBadge({ item }: { item: FileItem }) {
  const profileId = useActiveProfile()._id;

  if (item.itemType !== "file") return null;

  if (item.indexStatus === "indexed" && item.memoryId) {
    return (
      <Link
        to="/$profileId/memories/list/$id"
        params={{ profileId, id: item.memoryId }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-secondary/60 px-1.5 py-0.5 text-[11px] font-medium text-muted transition-[background-color] hover:bg-surface-tertiary"
        title="Indexed into the memory graph — open the memory"
      >
        <IconBrain size={12} stroke={1.8} />
        In memory
      </Link>
    );
  }

  if (item.indexStatus === "failed") {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full bg-surface-secondary/40 px-1.5 py-0.5 text-[11px] text-muted/70"
        title="Memory indexing failed"
      >
        Not indexed
      </span>
    );
  }

  return null;
}
