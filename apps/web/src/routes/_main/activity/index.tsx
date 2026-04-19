import { createFileRoute } from "@tanstack/react-router";
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
  IconCalendar,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import {
  activitySearchParams,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  DATE_PRESET_LABELS,
  type ActivityType,
  type DatePreset,
} from "./-searchParams";

export const Route = createFileRoute("/_main/activity/")({
  component: ActivityPage,
});

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
        <div key={i} className="rounded-xl border border-border p-4 sm:p-6">
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
      <h3 className="mb-1 text-lg font-medium text-foreground">
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

function TypeFilterDropdown({
  selectedTypes,
  onTypesChange,
}: {
  selectedTypes: ActivityType[];
  onTypesChange: (types: ActivityType[]) => void;
}) {
  const toggleType = (type: ActivityType) => {
    if (selectedTypes.includes(type)) {
      onTypesChange(selectedTypes.filter((t) => t !== type));
    } else {
      onTypesChange([...selectedTypes, type]);
    }
  };

  const label =
    selectedTypes.length === 0
      ? "All types"
      : selectedTypes.length === 1
        ? ACTIVITY_TYPE_LABELS[selectedTypes[0]]
        : `${selectedTypes.length} types`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <IconFilter size={16} />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>Activity Types</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACTIVITY_TYPES.map((type) => (
          <DropdownMenuCheckboxItem
            key={type}
            checked={selectedTypes.includes(type)}
            onCheckedChange={() => toggleType(type)}
          >
            {ACTIVITY_TYPE_LABELS[type]}
          </DropdownMenuCheckboxItem>
        ))}
        {selectedTypes.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={false}
              onCheckedChange={() => onTypesChange([])}
            >
              Clear all
            </DropdownMenuCheckboxItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const DATE_PRESETS: DatePreset[] = ["all", "today", "week", "month"];

function DateRangeDropdown({
  value,
  onChange,
}: {
  value: DatePreset;
  onChange: (preset: DatePreset) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <IconCalendar size={16} />
          {DATE_PRESET_LABELS[value]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Date Range</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as DatePreset)}
        >
          {DATE_PRESETS.map((preset) => (
            <DropdownMenuRadioItem key={preset} value={preset}>
              {DATE_PRESET_LABELS[preset]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortToggle({
  sortDir,
  onToggle,
}: {
  sortDir: "desc" | "asc";
  onToggle: () => void;
}) {
  const Icon = sortDir === "desc" ? IconSortDescending : IconSortAscending;
  const label = sortDir === "desc" ? "Newest" : "Oldest";

  return (
    <Button variant="ghost" size="sm" onClick={onToggle} className="gap-2">
      <Icon size={16} />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

function ActivityPage() {
  const { isAuthenticated } = useConvexAuth();
  const getRecentActivity = useAction(api.dashboardApi.getRecentActivity);

  const [params, setParams] = useQueryStates(activitySearchParams);
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

    // Filter by types
    if (params.types.length > 0) {
      result = result.filter((item) =>
        params.types.includes(item.type as ActivityType),
      );
    }

    // Filter by date range
    const threshold = getDateThreshold(params.range);
    if (threshold !== null) {
      result = result.filter(
        (item) => new Date(item.timestamp).getTime() >= threshold,
      );
    }

    // Sort
    result.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return params.sortDir === "desc" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [activity, params.types, params.range, params.sortDir]);

  const hasFilters = params.types.length > 0 || params.range !== "all";

  return (
    <PageContainer
      title="Activity"
      centeredMaxWidth
      noScroll
      rightSection={
        <div className="flex items-center gap-2">
          <DateRangeDropdown
            value={params.range}
            onChange={(range) => setParams({ range })}
          />
          <TypeFilterDropdown
            selectedTypes={params.types}
            onTypesChange={(types) => setParams({ types })}
          />
          <SortToggle
            sortDir={params.sortDir}
            onToggle={() =>
              setParams({ sortDir: params.sortDir === "desc" ? "asc" : "desc" })
            }
          />
        </div>
      }
    >
      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="mb-4 text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchActivity}>
            <IconLoader2 size={16} className="mr-2" />
            Retry
          </Button>
        </div>
      ) : filteredAndSortedActivity.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <Virtuoso
          data={filteredAndSortedActivity}
          computeItemKey={(_index, item) => item.id}
          defaultItemHeight={72}
          itemContent={(_index, item) => {
            const Icon = getActivityIcon(item.type);
            return (
              <div className="pb-3">
                <div className="rounded-xl border border-border bg-muted/30 p-3 transition-colors sm:p-4">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Icon size={20} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground sm:text-base">
                        {item.description}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                        {item.relativeTime}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          }}
        />
      )}
    </PageContainer>
  );
}
