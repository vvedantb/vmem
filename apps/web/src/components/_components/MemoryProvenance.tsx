import { Badge } from "@vmem/ui";
import { formatDateTime } from "@vmem/shared";
import { IconExternalLink } from "@tabler/icons-react";
import type { Memory } from "@/lib/memories";
import { formatMemorySourceLabel } from "@/lib/memories";
import { DetailSection } from "./detail-panel/DetailSection";
import { MemorySourceLabel } from "./MemorySourceLabel";

interface MemoryProvenanceProps {
  memory: Memory;
}

export default function MemoryProvenance({ memory }: MemoryProvenanceProps) {
  const sourceUrl = memory.sourceUrl;
  const sourceSyncedAt = memory.sourceSyncedAt;
  const hasUrl = sourceUrl !== null && sourceUrl.length > 0;
  const hasSyncedAt = sourceSyncedAt !== null && sourceSyncedAt.length > 0;

  if (!hasUrl && !hasSyncedAt) {
    return null;
  }

  const sourceLabel = formatMemorySourceLabel(memory.source);

  return (
    <DetailSection label="Imported from">
      <div className="space-y-3 rounded-lg bg-surface-secondary/60 p-4">
        <Badge
          variant="secondary"
          className="inline-flex items-center gap-1.5 text-xs"
        >
          <MemorySourceLabel source={memory.source} size={12} />
        </Badge>
        {hasSyncedAt ? (
          <p className="text-sm text-muted">
            Last synced {formatDateTime(sourceSyncedAt)}
          </p>
        ) : null}
        {hasUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-opacity hover:opacity-80"
          >
            Open in {sourceLabel}
            <IconExternalLink size={14} stroke={1.75} />
          </a>
        ) : null}
      </div>
    </DetailSection>
  );
}
