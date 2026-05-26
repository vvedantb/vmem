"use client";

import { useState, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { Badge, Button, cn } from "@vmem/ui";
import { IconAlertCircle, IconReceipt2 } from "@tabler/icons-react";
import type { Doc } from "@vmem/backend";
import {
  formatLogCost,
  formatLogTime,
  formatTokenPair,
  featureLabelFor,
} from "./_aiLogsUtils";
import { LogRowDetail } from "./LogRowDetail";

type LogRow = Doc<"openRouterLogs">;
type ProfileLite = {
  _id: string;
  name: string;
  color?: string | null | undefined;
};

interface LogsTableProps {
  rows: readonly LogRow[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
  scrollParent: HTMLDivElement | null;
  profilesById: ReadonlyMap<string, ProfileLite>;
  totalCalls: number | undefined;
}

export function LogsTable({
  rows,
  isLoading,
  hasMore,
  onLoadMore,
  onResetFilters,
  hasActiveFilters,
  scrollParent,
  profilesById,
  totalCalls,
}: LogsTableProps) {
  const [selected, setSelected] = useState<LogRow | null>(null);
  const isInitialLoading = isLoading && rows.length === 0;
  const items = useMemo(() => Array.from(rows), [rows]);

  if (isInitialLoading || !scrollParent) {
    return <AiLogsTableLoadingSkeleton />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        hasActiveFilters={hasActiveFilters}
        onResetFilters={onResetFilters}
      />
    );
  }

  const showingLabel =
    totalCalls !== undefined && totalCalls > items.length
      ? `Showing ${items.length} of ${totalCalls.toLocaleString()}`
      : `${items.length.toLocaleString()} call${items.length === 1 ? "" : "s"}`;

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 px-0.5">
          <h2 className="text-sm font-medium text-foreground">Recent calls</h2>
          <span className="text-xs tabular-nums text-muted">
            {showingLabel}
          </span>
        </div>

        <div className="hidden px-1 text-xs font-medium text-muted md:grid md:grid-cols-[132px_128px_112px_1fr_128px_88px_80px_72px] md:gap-3">
          <div>Time</div>
          <div>Feature</div>
          <div>Profile</div>
          <div>Model</div>
          <div className="text-right">Tokens</div>
          <div className="text-right">Cost</div>
          <div className="text-right">Latency</div>
          <div className="text-right">Status</div>
        </div>

        <Virtuoso
          data={items}
          customScrollParent={scrollParent}
          computeItemKey={(_index, row) => row._id}
          defaultItemHeight={56}
          endReached={() => {
            if (hasMore && !isLoading) onLoadMore();
          }}
          components={{
            Footer: () =>
              hasMore || isLoading ? (
                <div className="py-4 text-center text-xs text-muted">
                  {isLoading ? "Loading…" : "Scroll for more"}
                </div>
              ) : null,
          }}
          itemContent={(_index, row) => (
            <div className="pb-1">
              <LogRowCard
                row={row}
                profile={
                  row.profileId ? profilesById.get(row.profileId) : undefined
                }
                onClick={() => setSelected(row)}
              />
            </div>
          )}
        />
      </section>

      <LogRowDetail
        row={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        profile={
          selected?.profileId ? profilesById.get(selected.profileId) : undefined
        }
      />
    </>
  );
}

function AiLogsTableLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 animate-pulse rounded bg-surface-secondary/60" />
        <div className="h-3 w-24 animate-pulse rounded bg-surface-secondary/60" />
      </div>
      <div className="flex flex-col gap-1">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div
            key={index}
            className="h-14 animate-pulse rounded-xl bg-surface-secondary/40"
          />
        ))}
      </div>
    </div>
  );
}

function LogRowCard({
  row,
  profile,
  onClick,
}: {
  row: LogRow;
  profile: ProfileLite | undefined;
  onClick: () => void;
}) {
  const featureLabel = featureLabelFor(row.feature);
  const time = formatLogTime(row.createdAt);
  const tokens = formatTokenPair(row.promptTokens, row.completionTokens);
  const cost = formatLogCost(row.costUsd);
  const latency = `${row.latencyMs.toLocaleString()}ms`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-xl px-4 py-3 text-left transition-[background-color] hover:bg-surface-secondary/80 focus:bg-surface-secondary/80 focus:outline-none dark:hover:bg-surface-tertiary/50 dark:focus:bg-surface-tertiary/50"
    >
      <div className="hidden md:grid md:grid-cols-[132px_128px_112px_1fr_128px_88px_80px_72px] md:items-center md:gap-3">
        <span className="text-xs tabular-nums text-muted">{time}</span>
        <Badge variant="secondary" className="w-fit text-[11px] font-normal">
          {featureLabel}
        </Badge>
        <ProfileBadge profile={profile} />
        <span className="truncate font-mono text-xs text-foreground">
          {row.model}
        </span>
        <span className="text-right text-xs tabular-nums text-foreground">
          {tokens}
        </span>
        <span className="text-right text-xs tabular-nums text-foreground">
          {cost}
        </span>
        <span className="text-right text-xs tabular-nums text-muted">
          {latency}
        </span>
        <span className="flex justify-end">
          <StatusPill ok={row.ok} />
        </span>
      </div>

      <div className="space-y-1.5 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="text-[11px] font-normal">
            {featureLabel}
          </Badge>
          <StatusPill ok={row.ok} />
        </div>
        <div className="truncate font-mono text-xs text-foreground">
          {row.model}
        </div>
        <div className="flex items-center justify-between gap-3 text-xs tabular-nums text-muted">
          <span>{time}</span>
          <span>
            {tokens} · {cost} · {latency}
          </span>
        </div>
      </div>
    </button>
  );
}

function ProfileBadge({ profile }: { profile: ProfileLite | undefined }) {
  if (!profile) {
    return <span className="text-xs text-muted/70">—</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: profile.color ?? "var(--muted)" }}
      />
      <span className="truncate text-xs text-foreground">{profile.name}</span>
    </span>
  );
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-medium tabular-nums",
        ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
      )}
    >
      {ok ? (
        "ok"
      ) : (
        <>
          <IconAlertCircle size={12} className="mr-0.5" />
          error
        </>
      )}
    </span>
  );
}

function EmptyState({
  hasActiveFilters,
  onResetFilters,
}: {
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-surface-secondary/40 px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-secondary/60">
        <IconReceipt2 size={28} className="text-muted" stroke={1.5} />
      </div>
      <h3 className="mb-1 text-base font-medium text-foreground">
        {hasActiveFilters ? "No matching calls" : "No AI calls yet"}
      </h3>
      <p className="max-w-sm text-sm text-muted text-balance">
        {hasActiveFilters
          ? "Try adjusting your filters to see more results."
          : "Backend LLM and embedding calls will appear here when you save memories or run searches."}
      </p>
      {hasActiveFilters ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onResetFilters}
        >
          Reset filters
        </Button>
      ) : null}
    </div>
  );
}
