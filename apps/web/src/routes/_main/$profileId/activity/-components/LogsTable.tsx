"use client";

import { useState, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { Badge, Button, Card, CardContent, cn } from "@vmem/ui";
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

interface LogsVirtuosoContext {
  hasMore: boolean;
  isLoading: boolean;
  profilesById: ReadonlyMap<string, ProfileLite>;
  onSelectRow: (row: LogRow) => void;
}

function LogsTableFooter({ context }: { context?: LogsVirtuosoContext }) {
  if (!context?.hasMore && !context?.isLoading) return null;
  return (
    <div className="py-4 text-center text-xs text-muted">
      {context?.isLoading ? "Loading…" : "Scroll for more"}
    </div>
  );
}

function LogsVirtuosoRow({
  row,
  context,
}: {
  row: LogRow;
  context?: LogsVirtuosoContext;
}) {
  const profile = row.profileId
    ? context?.profilesById.get(row.profileId)
    : undefined;
  return (
    <div className="pb-1">
      <LogRowCard
        row={row}
        profile={profile}
        onClick={() => context?.onSelectRow(row)}
      />
    </div>
  );
}

function renderLogsVirtuosoRow(
  _index: number,
  row: LogRow,
  context?: LogsVirtuosoContext,
) {
  return <LogsVirtuosoRow row={row} context={context} />;
}

interface LogsTableProps {
  rows: readonly LogRow[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
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
  profilesById,
  totalCalls,
}: LogsTableProps) {
  const [selected, setSelected] = useState<LogRow | null>(null);
  const isInitialLoading = isLoading && rows.length === 0;
  const items = useMemo(() => Array.from(rows), [rows]);

  if (isInitialLoading) {
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
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-3 px-0.5">
          <h2 className="text-sm font-medium text-foreground">Recent calls</h2>
          <span className="text-xs tabular-nums text-muted">
            {showingLabel}
          </span>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col shadow-none">
          <CardContent className="flex min-h-0 flex-1 flex-col p-2">
            <div className="hidden shrink-0 px-2 pb-2 text-xs font-medium text-muted md:grid md:grid-cols-[132px_128px_112px_1fr_128px_88px_80px_72px] md:gap-3">
              <div>Time</div>
              <div>Feature</div>
              <div>Profile</div>
              <div>Model</div>
              <div className="text-right">Tokens</div>
              <div className="text-right">Cost</div>
              <div className="text-right">Latency</div>
              <div className="text-right">Status</div>
            </div>

            <div className="relative min-h-0 flex-1">
              <Virtuoso
                data={items}
                className="scrollbar-thin"
                style={{ height: "100%" }}
                context={{
                  hasMore,
                  isLoading,
                  profilesById,
                  onSelectRow: setSelected,
                }}
                computeItemKey={(_index, row) => row._id}
                defaultItemHeight={56}
                endReached={() => {
                  if (hasMore && !isLoading) onLoadMore();
                }}
                components={{ Footer: LogsTableFooter }}
                itemContent={renderLogsVirtuosoRow}
              />
            </div>
          </CardContent>
        </Card>
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
    </div>
  );
}

function AiLogsTableLoadingSkeleton() {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3 px-0.5">
        <div className="h-4 w-28 animate-pulse rounded bg-surface-tertiary/60" />
        <div className="h-3 w-24 animate-pulse rounded bg-surface-tertiary/60" />
      </div>
      <Card className="flex min-h-0 flex-1 flex-col shadow-none">
        <CardContent className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 scrollbar-thin">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-lg bg-surface-tertiary/40"
            />
          ))}
        </CardContent>
      </Card>
    </section>
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
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="block h-auto w-full justify-start rounded-lg px-4 py-3 text-left font-normal hover:bg-surface-tertiary/50 focus:bg-surface-tertiary/50 active:scale-100"
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
    </Button>
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
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 className="shrink-0 px-0.5 text-sm font-medium text-foreground">
        Recent calls
      </h2>
      <Card className="flex min-h-0 flex-1 flex-col shadow-none">
        <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-tertiary/60">
            <IconReceipt2 size={28} className="text-muted" stroke={1.5} />
          </div>
          <h3 className="mb-1 text-base font-medium text-foreground text-balance">
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
        </CardContent>
      </Card>
    </section>
  );
}
