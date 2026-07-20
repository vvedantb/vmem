import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Badge,
} from "@vmem/ui";
import { formatDateTime } from "@vmem/shared";
import type { AiLogRow, ProfileListItem } from "./types";
import { featureLabelFor, formatLogCost } from "./_aiLogsUtils";

// detail dialog for one ai log row (prompt/response when logging enabled)
type LogRow = AiLogRow;

interface LogRowDetailProps {
  row: LogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileListItem | undefined;
}

export function LogRowDetail({
  row,
  open,
  onOpenChange,
  profile,
}: LogRowDetailProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {row && <LogRowDetailBody row={row} profile={profile} />}
      </DialogContent>
    </Dialog>
  );
}

function LogRowDetailBody({
  row,
  profile,
}: {
  row: LogRow;
  profile: ProfileListItem | undefined;
}) {
  const featureLabel = featureLabelFor(row.feature);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs font-normal">
            {featureLabel}
          </Badge>
          <span className="font-mono text-sm text-muted">{row.model}</span>
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 text-sm">
        <Section title="Call">
          <KV label="Endpoint" value={row.endpoint} />
          {row.errorMessage && (
            <KV label="Error message" value={row.errorMessage} mono />
          )}
          {row.generationId && (
            <KV label="Generation id" value={row.generationId} mono />
          )}
          {row.provider && <KV label="Provider" value={row.provider} />}
          {row.finishReason && (
            <KV label="Finish reason" value={row.finishReason} />
          )}
          {row.nativeFinishReason && (
            <KV label="Native finish reason" value={row.nativeFinishReason} />
          )}
        </Section>

        <Section title="Cost & tokens">
          <KV
            label="Total tokens"
            value={
              row.totalTokens !== undefined
                ? row.totalTokens.toLocaleString()
                : "—"
            }
          />
          <KV
            label="Prompt tokens"
            value={
              row.promptTokens !== undefined
                ? row.promptTokens.toLocaleString()
                : "—"
            }
          />
          <KV
            label="Completion tokens"
            value={
              row.completionTokens !== undefined
                ? row.completionTokens.toLocaleString()
                : "—"
            }
          />
          {row.cachedTokens !== undefined && (
            <KV
              label="Cached tokens"
              value={row.cachedTokens.toLocaleString()}
            />
          )}
          {row.cacheWriteTokens !== undefined && (
            <KV
              label="Cache-write tokens"
              value={row.cacheWriteTokens.toLocaleString()}
            />
          )}
          {row.reasoningTokens !== undefined && (
            <KV
              label="Reasoning tokens"
              value={row.reasoningTokens.toLocaleString()}
            />
          )}
          <KV label="Cost (USD)" value={formatLogCost(row.costUsd)} />
          {row.upstreamCostUsd !== undefined && (
            <KV
              label="Upstream cost (USD)"
              value={formatLogCost(row.upstreamCostUsd)}
            />
          )}
          {row.isByok && <KV label="BYOK" value="yes" />}
        </Section>

        <Section title="Context">
          <KV label="When" value={formatDateTime(row.createdAt)} />
          {profile ? (
            <KV
              label="Profile"
              value={
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: profile.color ?? "var(--muted)",
                    }}
                  />
                  {profile.name}
                </span>
              }
            />
          ) : (
            <KV label="Profile" value="—" />
          )}
        </Section>

        {(row.promptPreview || row.completionPreview) && (
          <Section title="Preview">
            {row.promptPreview && (
              <PreviewBlock label="Prompt" body={row.promptPreview} />
            )}
            {row.completionPreview && (
              <PreviewBlock label="Completion" body={row.completionPreview} />
            )}
          </Section>
        )}
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
        {title}
      </h3>
      <div className="space-y-1.5 rounded-lg bg-surface-secondary/40 p-3">
        {children}
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span
        className={
          mono
            ? "break-all font-mono text-xs text-foreground"
            : "text-sm tabular-nums text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

function PreviewBlock({ label, body }: { label: string; body: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted">{label}</p>
      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-secondary/60 p-2 font-mono text-xs text-foreground">
        {body}
      </pre>
    </div>
  );
}
