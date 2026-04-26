"use client";

import { useState, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { Badge, Skeleton, Button } from "@vmem/ui";
import { IconAlertCircle, IconReceipt2 } from "@tabler/icons-react";
import type { Doc } from "@vmem/backend";
import { FEATURE_LABELS, type Feature } from "../-searchParams";
import { LogRowDetail } from "./LogRowDetail";

/**
 * Virtualised log table. Click any row to open the detail panel.
 *
 * Columns kept tight on small screens — the detail panel is the canonical
 * "see everything for one row" view, so the row itself only needs the
 * highest-signal columns. Mobile collapses to a stacked card layout.
 */
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
}: LogsTableProps) {
  const [selected, setSelected] = useState<LogRow | null>(null);

  // The list animation hooks below depend on whether we're rendering
  // skeleton, empty, or data state. Computing them up-front keeps the
  // render branch simple and React's reconciler happy.
  const isInitialLoading = isLoading && rows.length === 0;

  const sortedDirection: "desc" = "desc"; // wired in via parent — surface unchanged.
  // Note: parent already orders rows server-side; the prop is kept for
  // future client-side flips without re-issuing the paginated query.
  void sortedDirection;

  const items = useMemo(() => Array.from(rows), [rows]);

  if (isInitialLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        hasActiveFilters={hasActiveFilters}
        onResetFilters={onResetFilters}
      />
    );
  }

  if (!scrollParent) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:grid md:grid-cols-[140px_140px_120px_1fr_140px_100px_90px_80px] md:gap-3 md:px-3 md:pb-2 md:text-xs md:font-medium md:text-muted-foreground">
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
              <div className="py-3 text-center text-xs text-muted-foreground">
                {isLoading ? "Loading…" : "Scroll for more"}
              </div>
            ) : null,
        }}
        itemContent={(_index, row) => (
          <div className="pb-1.5">
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

function LogRowCard({
  row,
  profile,
  onClick,
}: {
  row: LogRow;
  profile: ProfileLite | undefined;
  onClick: () => void;
}) {
  const featureLabel = FEATURE_LABELS[row.feature as Feature] ?? row.feature;
  const time = formatTime(row.createdAt);
  const tokens = formatTokenPair(row.promptTokens, row.completionTokens);
  const cost = formatCost(row.costUsd);
  const latency = `${row.latencyMs.toLocaleString()}ms`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-lg bg-muted/40 px-3 py-3 text-left transition-[background-color] hover:bg-muted/70 focus:outline-none focus:bg-muted/70"
    >
      {/* Desktop layout */}
      <div className="hidden md:grid md:grid-cols-[140px_140px_120px_1fr_140px_100px_90px_80px] md:items-center md:gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          {time}
        </span>
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
        <span className="text-right text-xs tabular-nums text-muted-foreground">
          {latency}
        </span>
        <span className="flex justify-end">
          <StatusPill ok={row.ok} />
        </span>
      </div>

      {/* Mobile stacked layout */}
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
        <div className="flex items-center justify-between gap-3 text-xs tabular-nums text-muted-foreground">
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
    return <span className="text-xs text-muted-foreground/70">—</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: profile.color ?? "var(--muted-foreground)" }}
      />
      <span className="truncate text-xs text-foreground">{profile.name}</span>
    </span>
  );
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        ok
          ? "inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
          : "inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive"
      }
    >
      {ok ? (
        "ok"
      ) : (
        <>
          <IconAlertCircle size={12} />
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
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <IconReceipt2 size={32} className="text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-lg font-medium text-foreground">
        {hasActiveFilters ? "No matching calls" : "No OpenRouter calls yet"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {hasActiveFilters
          ? "Try adjusting your filters."
          : "Fire one to populate — save a memory or run a search."}
      </p>
      {hasActiveFilters && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onResetFilters}
        >
          Reset filters
        </Button>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return `${d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatTokenPair(
  prompt: number | undefined,
  completion: number | undefined,
): string {
  if (prompt === undefined && completion === undefined) return "—";
  const p = prompt ?? 0;
  const c = completion ?? 0;
  return `${p.toLocaleString()}→${c.toLocaleString()}`;
}

function formatCost(amount: number | undefined): string {
  if (amount === undefined) return "—";
  if (amount === 0) return "$0";
  if (amount < 0.0001) return "<$0.0001";
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
