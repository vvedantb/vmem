import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryStates } from "nuqs";
import { useConvexAuth, useAction } from "convex/react";
import {
  Button,
  Skeleton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@vmem/ui";
import { Virtuoso } from "react-virtuoso";
import {
  IconBrain,
  IconUpload,
  IconPlugConnected,
  IconKey,
  IconCheck,
  IconLoader2,
  IconFilter,
  IconSortDescending,
  IconSortAscending,
  IconActivity,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import {
  activitySearchParams,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  DATE_PRESET_LABELS,
  type ActivityType,
  type DatePreset,
  type SortDirection,
} from "../-searchParams";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  relativeTime: string;
}

function getActivityIcon(type: string) {
  switch (type) {
    case "memory_created":
    case "memory_updated":
      return IconBrain;
    case "memory_dream_created":
      return IconSparkles;
    case "file_uploaded":
      return IconUpload;
    case "sync_completed":
      return IconPlugConnected;
    case "api_key_created":
      return IconKey;
    default:
      return IconCheck;
  }
}

function getDateThreshold(preset: DatePreset): number | null {
  const now = Date.now();
  switch (preset) {
    case "today":
      return now - 24 * 60 * 60 * 1000;
    case "week":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "month":
      return now - 30 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl bg-muted/40 p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <IconActivity size={32} className="text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-lg font-medium text-foreground text-balance">
        {hasFilters ? "No matching activity" : "No activity yet"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? "Try adjusting your filters to see more results."
          : "Your activity history will appear here."}
      </p>
    </div>
  );
}

const DATE_PRESETS: DatePreset[] = ["all", "today", "week", "month"];

/**
 * Activity panel for the Inbox.
 *
 * Renders the list/Virtuoso virtualised table. The orchestrator owns the
 * scroll container and passes its ref in via `scrollParent` so Virtuoso
 * can hook into PageContainer's scroll surface (rather than introducing
 * a nested scroller).
 */
export function ActivityPanel({
  scrollParent,
}: {
  scrollParent: HTMLDivElement | null;
}) {
  const { isAuthenticated } = useConvexAuth();
  const getRecentActivity = useAction(api.dashboardApi.getRecentActivity);

  const [params] = useQueryStates(activitySearchParams);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getRecentActivity({ limit: 200 });
      setActivity(data);
    } catch (err) {
      console.error("Failed to fetch activity:", err);
      setError("Failed to load activity. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getRecentActivity]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const filteredAndSortedActivity = useMemo(() => {
    let result = [...activity];

    if (params.types.length > 0) {
      result = result.filter((item) =>
        params.types.includes(item.type as ActivityType),
      );
    }

    const threshold = getDateThreshold(params.range);
    if (threshold !== null) {
      result = result.filter(
        (item) => new Date(item.timestamp).getTime() >= threshold,
      );
    }

    result.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return params.sortDir === "desc" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [activity, params.types, params.range, params.sortDir]);

  const hasFilters = params.types.length > 0 || params.range !== "all";

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="mb-4 text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchActivity}>
          <IconLoader2 size={16} className="mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (filteredAndSortedActivity.length === 0) {
    return <EmptyState hasFilters={hasFilters} />;
  }

  if (!scrollParent) return <LoadingSkeleton />;

  return (
    <Virtuoso
      data={filteredAndSortedActivity}
      customScrollParent={scrollParent}
      computeItemKey={(_index, item) => item.id}
      defaultItemHeight={72}
      itemContent={(_index, item) => {
        const Icon = getActivityIcon(item.type);
        return (
          <div className="pb-3">
            <div className="rounded-xl bg-muted/40 p-3 transition-colors sm:p-4">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Icon size={20} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground sm:text-base">
                    {item.description}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm tabular-nums">
                    {item.relativeTime}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}

/**
 * Activity-specific filters + sort dropdowns. Lives in the right-section
 * of the inbox header when the activity tab is active.
 *
 * Filters dropdown consolidates Date Range + Activity Types with an
 * active-filter count badge. Sort is intentionally separate — it doesn't
 * change which items are visible, only their order.
 */
export function ActivityRightSection() {
  const [params, setParams] = useQueryStates(activitySearchParams);

  return (
    <div className="flex items-center gap-2">
      <ActivityFiltersDropdown
        types={params.types}
        range={params.range}
        onTypesChange={(types) => setParams({ types })}
        onRangeChange={(range) => setParams({ range })}
        onReset={() => setParams({ types: [], range: "all" })}
      />
      <ActivitySortDropdown
        sortDir={params.sortDir}
        onSortDirChange={(sortDir) => setParams({ sortDir })}
      />
    </div>
  );
}

function ActivityFiltersDropdown({
  types,
  range,
  onTypesChange,
  onRangeChange,
  onReset,
}: {
  types: ActivityType[];
  range: DatePreset;
  onTypesChange: (types: ActivityType[]) => void;
  onRangeChange: (range: DatePreset) => void;
  onReset: () => void;
}) {
  const toggleType = (type: ActivityType) => {
    if (types.includes(type)) {
      onTypesChange(types.filter((t) => t !== type));
    } else {
      onTypesChange([...types, type]);
    }
  };

  const activeFilterCount =
    (types.length > 0 ? 1 : 0) + (range !== "all" ? 1 : 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-2">
          <IconFilter size={16} />
          Filters
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] font-medium tabular-nums text-primary-foreground flex items-center justify-center leading-none">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Date Range</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={range}
              onValueChange={(v) => {
                const preset = DATE_PRESETS.find((p) => p === v);
                if (preset) onRangeChange(preset);
              }}
            >
              {DATE_PRESETS.map((preset) => (
                <DropdownMenuRadioItem key={preset} value={preset}>
                  {DATE_PRESET_LABELS[preset]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Activity Types</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ACTIVITY_TYPES.map((type) => (
              <DropdownMenuCheckboxItem
                key={type}
                checked={types.includes(type)}
                onCheckedChange={() => toggleType(type)}
              >
                {ACTIVITY_TYPE_LABELS[type]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {activeFilterCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onReset}
              className="text-destructive focus:text-destructive"
            >
              <IconX size={16} />
              Clear filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActivitySortDropdown({
  sortDir,
  onSortDirChange,
}: {
  sortDir: SortDirection;
  onSortDirChange: (sortDir: SortDirection) => void;
}) {
  const Icon = sortDir === "desc" ? IconSortDescending : IconSortAscending;
  const label = sortDir === "desc" ? "Newest" : "Oldest";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Icon size={16} />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Sort</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sortDir}
          onValueChange={(v) => {
            if (v === "desc" || v === "asc") {
              onSortDirChange(v);
            }
          }}
        >
          <DropdownMenuRadioItem value="desc">
            Newest first
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="asc">
            Oldest first
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
