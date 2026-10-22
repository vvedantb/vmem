import { useState } from "react";
import { useQueryStates } from "nuqs";
import { usePaginatedQuery, useQuery } from "convex/react";
import {
  Button,
  Card,
  CardContent,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Skeleton,
} from "@vvedantb/ui";
import {
  IconCircleCheck,
  IconCircleX,
  IconFilter,
  IconListDetails,
  IconTimelineEvent,
  IconTool,
  IconUser,
  IconUsersGroup,
  IconX,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import {
  isAllProfilesFilter,
  PROFILE_FILTER_ALL,
} from "@/lib/url-state/activity";
import {
  TOOL_FILTER_ALL,
  tracesSearchParams,
  type TraceStatus,
} from "@/lib/url-state/traces";
import {
  FacetedFilterBadge,
  FacetedFilterOption,
} from "@/components/_components/FacetedFilter";
import { formatLogTime, normalizeProfileId } from "../activity/_aiLogsUtils";
import type { ProfileListItem } from "../activity/types";
import {
  formatTraceDuration,
  traceListFilters,
  traceToolOptions,
  type TraceRow,
} from "./_tracesUtils";
import { TraceDetailDialog, TraceStatusBadge } from "./TraceDetailDialog";

const PAGE_SIZE = 50;

// header and rows must share one template or the columns silently drift apart
const TRACE_GRID_COLS = "md:grid-cols-[112px_180px_64px_72px_1fr]";

const STATUS_LABELS: Record<TraceStatus, string> = {
  all: "All",
  ok: "OK",
  error: "Error",
};

// mcp tool-call traces for `/traces`
export function TracesPanel() {
  const [params, setParams] = useQueryStates(tracesSearchParams);
  // selected row is local view state; the detail query runs only while set
  const [selected, setSelected] = useState<TraceRow | null>(null);
  const profiles = useQuery(api.profiles.list);

  const paged = usePaginatedQuery(
    api.mcpTraces.listMine,
    {
      ...traceListFilters(params),
      profileId: isAllProfilesFilter(params.profileId)
        ? undefined
        : normalizeProfileId(params.profileId, profiles),
    },
    { initialNumItems: PAGE_SIZE },
  );

  const hasActiveFilters =
    params.tool !== TOOL_FILTER_ALL ||
    params.status !== "all" ||
    !isAllProfilesFilter(params.profileId);

  const resetFilters = () => {
    void setParams({
      tool: TOOL_FILTER_ALL,
      status: "all",
      profileId: PROFILE_FILTER_ALL,
    });
  };

  const rows = paged.results;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h2 className="text-sm font-medium text-foreground">
          Recent tool calls
        </h2>
        <div className="flex items-center gap-3">
          {rows.length > 0 ? (
            <span className="text-xs tabular-nums text-muted">
              {rows.length.toLocaleString()} call{rows.length === 1 ? "" : "s"}
            </span>
          ) : null}
          <TracesFiltersDropdown
            tool={params.tool}
            toolOptions={traceToolOptions(rows, params.tool)}
            status={params.status}
            profileId={params.profileId}
            profiles={profiles}
            onToolChange={(tool) => setParams({ tool })}
            onStatusChange={(status) => setParams({ status })}
            onProfileChange={(profileId) => setParams({ profileId })}
            onReset={resetFilters}
          />
        </div>
      </div>

      {paged.status === "LoadingFirstPage" ? (
        <TracesLoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
        />
      ) : (
        <Card className="shadow-none">
          <CardContent className="p-2">
            <div
              className={cn(
                "hidden px-2 pb-2 text-xs font-medium text-muted md:grid md:gap-3",
                TRACE_GRID_COLS,
              )}
            >
              <div>Time</div>
              <div>Tool</div>
              <div>Status</div>
              <div className="text-right">Duration</div>
              <div>Summary</div>
            </div>
            <div className="space-y-1">
              {rows.map((row) => (
                <TraceRowButton
                  key={row._id}
                  row={row}
                  onClick={() => setSelected(row)}
                />
              ))}
            </div>
            {paged.status === "CanLoadMore" ||
            paged.status === "LoadingMore" ? (
              <div className="flex justify-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={paged.status === "LoadingMore"}
                  onClick={() => paged.loadMore(PAGE_SIZE)}
                >
                  {paged.status === "LoadingMore" ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <TraceDetailDialog
        row={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        profile={
          selected?.profileId
            ? profiles?.find((p) => p._id === selected.profileId)
            : undefined
        }
      />
    </section>
  );
}

function TraceRowButton({
  row,
  onClick,
}: {
  row: TraceRow;
  onClick: () => void;
}) {
  const time = formatLogTime(row.createdAt);
  const duration = formatTraceDuration(row.durationMs);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="block h-auto w-full justify-start rounded-lg px-4 py-3 text-left font-normal hover:bg-surface-tertiary/50 focus:bg-surface-tertiary/50 active:scale-100"
    >
      <div
        className={cn(
          "hidden md:grid md:items-center md:gap-3",
          TRACE_GRID_COLS,
        )}
      >
        <span className="text-xs tabular-nums text-muted">{time}</span>
        <span className="truncate font-mono text-xs text-foreground">
          {row.tool}
        </span>
        <TraceStatusBadge ok={row.ok} />
        <span className="text-right text-xs tabular-nums text-muted">
          {duration}
        </span>
        <span className="truncate text-xs text-foreground">{row.summary}</span>
      </div>

      <div className="space-y-1.5 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-xs text-foreground">
            {row.tool}
          </span>
          <TraceStatusBadge ok={row.ok} />
        </div>
        <div className="truncate text-xs text-foreground">{row.summary}</div>
        <div className="flex items-center justify-between gap-3 text-xs tabular-nums text-muted">
          <span>{time}</span>
          <span>{duration}</span>
        </div>
      </div>
    </Button>
  );
}

interface TracesFiltersDropdownProps {
  tool: string;
  toolOptions: readonly string[];
  status: TraceStatus;
  profileId: string;
  profiles: readonly ProfileListItem[] | undefined;
  onToolChange: (tool: string) => void;
  onStatusChange: (status: TraceStatus) => void;
  onProfileChange: (profileId: string) => void;
  onReset: () => void;
}

function TracesFiltersDropdown({
  tool,
  toolOptions,
  status,
  profileId,
  profiles,
  onToolChange,
  onStatusChange,
  onProfileChange,
  onReset,
}: TracesFiltersDropdownProps) {
  const activeFilterCount =
    (tool !== TOOL_FILTER_ALL ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (!isAllProfilesFilter(profileId) ? 1 : 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-2">
          <IconFilter size={16} />
          Filters
          <FacetedFilterBadge count={activeFilterCount} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconTool size={16} />
            Tool
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
            <DropdownMenuRadioGroup value={tool} onValueChange={onToolChange}>
              <DropdownMenuRadioItem value={TOOL_FILTER_ALL}>
                <FacetedFilterOption icon={<IconListDetails size={16} />}>
                  All tools
                </FacetedFilterOption>
              </DropdownMenuRadioItem>
              {toolOptions.map((name) => (
                <DropdownMenuRadioItem key={name} value={name}>
                  <span className="truncate font-mono text-xs">{name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconCircleCheck size={16} />
            Status
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={status}
              onValueChange={(value) => {
                if (value === "all" || value === "ok" || value === "error") {
                  onStatusChange(value);
                }
              }}
            >
              <DropdownMenuRadioItem value="all">
                <FacetedFilterOption icon={<IconListDetails size={16} />}>
                  {STATUS_LABELS.all}
                </FacetedFilterOption>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="ok">
                <FacetedFilterOption icon={<IconCircleCheck size={16} />}>
                  {STATUS_LABELS.ok}
                </FacetedFilterOption>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="error">
                <FacetedFilterOption icon={<IconCircleX size={16} />}>
                  {STATUS_LABELS.error}
                </FacetedFilterOption>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconUser size={16} />
            Profile
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={
                isAllProfilesFilter(profileId) ? PROFILE_FILTER_ALL : profileId
              }
              onValueChange={onProfileChange}
            >
              <DropdownMenuRadioItem value={PROFILE_FILTER_ALL}>
                <FacetedFilterOption icon={<IconUsersGroup size={16} />}>
                  All
                </FacetedFilterOption>
              </DropdownMenuRadioItem>
              {(profiles ?? []).map((p) => (
                <DropdownMenuRadioItem key={p._id} value={p._id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color ?? "var(--muted)" }}
                    />
                    {p.name}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {activeFilterCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onReset}
              className="text-danger focus:text-danger"
            >
              <IconX size={16} />
              Reset filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TracesLoadingSkeleton() {
  return (
    <Card className="shadow-none">
      <CardContent className="space-y-1 p-2">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton
            key={index}
            className="h-11 rounded-lg bg-surface-tertiary/40"
          />
        ))}
      </CardContent>
    </Card>
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
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-tertiary/60">
          <IconTimelineEvent size={28} className="text-muted" stroke={1.5} />
        </div>
        <h3 className="mb-1 text-base font-medium text-foreground text-balance">
          {hasActiveFilters ? "No matching traces" : "No MCP tool calls yet"}
        </h3>
        <p className="max-w-sm text-sm text-muted text-balance">
          {hasActiveFilters
            ? "Try adjusting your filters to see more results."
            : "Traces show the MCP tool calls your AI clients made in the last 7 days. Older traces are deleted."}
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
  );
}
