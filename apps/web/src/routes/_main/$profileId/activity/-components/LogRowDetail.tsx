"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Badge,
} from "@vmem/ui";
import type { Doc } from "@vmem/backend";
import { featureLabelFor } from "./_aiLogsUtils";

/**
 * Side-style detail panel for a single log row.
 *
 * Shows everything `listMine` returned for the row plus the truncated
 * prompt/completion previews when the deploy enabled them via
 * `OPENROUTER_LOG_PROMPTS=1`. The privacy default is OFF — when the env
 * isn't set the previews are absent on the row, so the panel just hides
 * those sections rather than displaying empty placeholders.
 *
 * Implemented via Dialog for now (no Sheet primitive in @vmem/ui yet).
 * Per CLAUDE.md, modal-style overlays are allowed to use shadows since
 * they are floating, not inline content.
 */
type LogRow = Doc<"openRouterLogs">;
type ProfileLite = {
  _id: string;
  name: string;
  color?: string | null | undefined;
};

interface LogRowDetailProps {
  row: LogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileLite | undefined;
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
  profile: ProfileLite | undefined;
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
          <KV
            label="Status"
            value={`${row.status} (${row.ok ? "ok" : "error"})`}
          />
          <KV label="Latency" value={`${row.latencyMs.toLocaleString()} ms`} />
          {row.errorClass && <KV label="Error class" value={row.errorClass} />}
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
          <KV label="Cost (USD)" value={formatCost(row.costUsd)} />
          {row.upstreamCostUsd !== undefined && (
            <KV
              label="Upstream cost (USD)"
              value={formatCost(row.upstreamCostUsd)}
            />
          )}
          {row.isByok && <KV label="BYOK" value="yes" />}
        </Section>

        <Section title="Context">
          <KV label="When" value={new Date(row.createdAt).toLocaleString()} />
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

function formatCost(amount: number | undefined): string {
  if (amount === undefined) return "—";
  if (amount === 0) return "$0";
  if (amount < 0.0001) return "<$0.0001";
  if (amount < 1) return `$${amount.toFixed(6)}`;
  return `$${amount.toFixed(4)}`;
}
