import { useQuery } from "convex/react";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@vvedantb/ui";
import { api } from "@vmem/backend";
import { formatDateTime } from "@vmem/shared";
import { KV, PreviewBlock, Section } from "../activity/LogRowDetail";
import type { ProfileListItem } from "../activity/types";
import {
  formatTraceDuration,
  prettyTraceArgs,
  type TraceRow,
} from "./_tracesUtils";

// detail dialog for one mcp trace; the heavy detail row loads only when open
export function TraceDetailDialog({
  row,
  onOpenChange,
  profile,
}: {
  row: TraceRow | null;
  onOpenChange: (open: boolean) => void;
  profile: ProfileListItem | undefined;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {row && <TraceDetailBody row={row} profile={profile} />}
      </DialogContent>
    </Dialog>
  );
}

export function TraceStatusBadge({ ok }: { ok: boolean }) {
  return (
    <Badge
      variant={ok ? "success" : "destructive"}
      className="w-fit text-[11px] font-normal"
    >
      {ok ? "ok" : "error"}
    </Badge>
  );
}

function TraceDetailBody({
  row,
  profile,
}: {
  row: TraceRow;
  profile: ProfileListItem | undefined;
}) {
  const result = useQuery(api.mcpTraces.getDetail, { traceId: row._id });
  const detail = result?.detail;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <TraceStatusBadge ok={row.ok} />
          <span className="font-mono text-sm">{row.tool}</span>
        </DialogTitle>
      </DialogHeader>

      <div className="max-h-[70dvh] space-y-4 overflow-y-auto text-sm scrollbar-thin">
        <Section title="Call">
          <KV label="Summary" value={row.summary} />
          <KV label="When" value={formatDateTime(row.createdAt)} />
          <KV label="Duration" value={formatTraceDuration(row.durationMs)} />
          {row.resultCount !== undefined && (
            <KV label="Results" value={row.resultCount.toLocaleString()} />
          )}
          <KV label="Scope" value={row.scope} />
          <KV label="Profile" value={profile?.name ?? "—"} />
        </Section>

        {result === undefined ? (
          <Skeleton className="h-32 rounded-lg bg-surface-tertiary/40" />
        ) : detail ? (
          <>
            {detail.error && (
              <Section title="Error">
                <PreviewBlock label="Message" body={detail.error} />
              </Section>
            )}
            <Section title="Arguments">
              <PreviewBlock label="JSON" body={prettyTraceArgs(detail.args)} />
            </Section>
            {detail.resultIds.length > 0 && (
              <Section title="Result ids">
                <PreviewBlock label="Ids" body={detail.resultIds.join("\n")} />
              </Section>
            )}
            {detail.resultPreview && (
              <Section title="Preview">
                <PreviewBlock label="Result" body={detail.resultPreview} />
              </Section>
            )}
          </>
        ) : (
          <p className="text-xs text-muted">
            The details for this trace are no longer available.
          </p>
        )}
      </div>
    </>
  );
}
