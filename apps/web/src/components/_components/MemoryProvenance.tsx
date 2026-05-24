import { Badge } from "@vmem/ui";
import { IconExternalLink } from "@tabler/icons-react";
import type { Memory } from "@/lib/memories";
import { formatMemorySourceLabel } from "@/lib/memories";

interface MemoryProvenanceProps {
  memory: Memory;
}

function formatSyncedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MemoryProvenance({ memory }: MemoryProvenanceProps) {
  const hasUrl = memory.sourceUrl !== null && memory.sourceUrl.length > 0;
  const hasSyncedAt =
    memory.sourceSyncedAt !== null && memory.sourceSyncedAt.length > 0;

  if (!hasUrl && !hasSyncedAt) {
    return null;
  }

  const sourceLabel = formatMemorySourceLabel(memory.source);

  return (
    <div className="rounded-lg bg-muted/40 p-4 space-y-2">
      <p className="text-sm font-medium text-foreground">Imported from</p>
      <Badge
        variant="outline"
        className="bg-muted border-border text-muted-foreground text-xs"
      >
        {sourceLabel}
      </Badge>
      {hasSyncedAt ? (
        <p className="text-sm text-muted-foreground">
          Last synced {formatSyncedAt(memory.sourceSyncedAt)}
        </p>
      ) : null}
      {hasUrl ? (
        <a
          href={memory.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Open in {sourceLabel}
          <IconExternalLink size={14} />
        </a>
      ) : null}
    </div>
  );
}
