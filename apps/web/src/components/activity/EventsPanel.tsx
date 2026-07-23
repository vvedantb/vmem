import { useState, useEffect } from "react";
import { useQueryStates } from "nuqs";
import { useConvexAuth, useAction } from "convex/react";
import { useActiveProfile } from "@/components/workspace/active-profile";
import {
  Button,
  Card,
  CardContent,
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
  IconCalendar,
  IconCalendarMonth,
  IconCalendarWeek,
  IconInfinity,
  IconSun,
  IconList,
  IconPencil,
  IconTrash,
  type TablerIcon,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { getActivityLabel } from "./_eventsUtils";
import {
  eventsSearchParams,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  EVENT_DATE_PRESET_LABELS,
  type EventType,
  type EventDatePreset,
  type SortDirection,
} from "@/lib/url-state/activity";
import type { ActivityItem } from "./types";
import {
  FacetedFilterBadge,
  FacetedFilterOption,
  toggleArrayItem,
} from "@/components/_components/FacetedFilter";

const EVENT_TYPE_ICONS: Record<EventType, TablerIcon> = {
  memory_created: IconBrain,
  memory_dream_created: IconSparkles,
  memory_updated: IconPencil,
  memory_deleted: IconTrash,
  file_uploaded: IconUpload,
  sync_completed: IconPlugConnected,
  api_key_created: IconKey,
};

const EVENT_DATE_ICONS: Record<EventDatePreset, TablerIcon> = {
  all: IconInfinity,
  today: IconSun,
  week: IconCalendarWeek,
  month: IconCalendarMonth,
};

function isEventType(type: string): type is EventType {
  return Object.prototype.hasOwnProperty.call(EVENT_TYPE_ICONS, type);
}

function getActivityIcon(type: string) {
  if (isEventType(type)) {
    return EVENT_TYPE_ICONS[type];
  }
  return IconCheck;
}

function getDateThreshold(preset: EventDatePreset): number | null {
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

function ActivityEventRow({ item }: { item: ActivityItem }) {
  const Icon = getActivityIcon(item.type);

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-[background-color] hover:bg-surface-tertiary/50 [content-visibility:auto] [contain-intrinsic-size:auto_2.75rem]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary/60">
        <Icon size={16} className="text-muted" stroke={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-foreground">
            {getActivityLabel(item.description)}
          </p>
          <p className="shrink-0 text-xs tabular-nums text-muted">
            {item.relativeTime}
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <Card className="flex h-full min-h-0 flex-1 flex-col shadow-none">
      <CardContent className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 scrollbar-thin">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <Skeleton className="h-4 w-48 max-w-full rounded" />
                <Skeleton className="h-3 w-14 shrink-0 rounded" />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function NoActivityEmptyState() {
  return (
    <Card className="flex min-h-0 flex-1 flex-col shadow-none">
      <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-tertiary/60">
          <IconActivity size={28} className="text-muted" stroke={1.5} />
        </div>
        <h3 className="mb-1 text-base font-medium text-foreground text-balance">
          No activity yet
        </h3>
        <p className="max-w-sm text-sm text-muted text-balance">
          Your activity history will appear here.
        </p>
      </CardContent>
    </Card>
  );
}

function FilteredActivityEmptyState() {
  return (
    <Card className="flex min-h-0 flex-1 flex-col shadow-none">
      <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-tertiary/60">
          <IconActivity size={28} className="text-muted" stroke={1.5} />
        </div>
        <h3 className="mb-1 text-base font-medium text-foreground text-balance">
          No matching activity
        </h3>
        <p className="max-w-sm text-sm text-muted text-balance">
          Try adjusting your filters to see more results.
        </p>
      </CardContent>
    </Card>
  );
}

function filterAndSortActivity(
  activity: ActivityItem[],
  types: EventType[],
  range: EventDatePreset,
  sortDir: SortDirection,
): ActivityItem[] {
  let result = [...activity];

  if (types.length > 0) {
    result = result.filter(
      (item) => isEventType(item.type) && types.includes(item.type),
    );
  }

  const threshold = getDateThreshold(range);
  if (threshold !== null) {
    result = result.filter(
      (item) => new Date(item.timestamp).getTime() >= threshold,
    );
  }

  result.sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime();
    const dateB = new Date(b.timestamp).getTime();
    return sortDir === "desc" ? dateB - dateA : dateA - dateB;
  });

  return result;
}

const DATE_PRESETS: EventDatePreset[] = ["all", "today", "week", "month"];

// events panel for `/activity`
export function EventsPanel() {
  const { isAuthenticated } = useConvexAuth();
  const activeProfileId = useActiveProfile()._id;
  const getRecentActivity = useAction(api.dashboardApi.getRecentActivity);

  const [params] = useQueryStates(eventsSearchParams);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void getRecentActivity({
      limit: 200,
      profileId: activeProfileId,
    })
      .then((data) => {
        if (!cancelled) setActivity(data);
      })
      .catch((err) => {
        console.error("Failed to fetch activity:", err);
        if (!cancelled) {
          setError("Failed to load activity. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getRecentActivity, activeProfileId]);

  const filteredAndSortedActivity = filterAndSortActivity(
    activity,
    params.types,
    params.range,
    params.sortDir,
  );

  const hasFilters = params.types.length > 0 || params.range !== "all";

  const retryFetch = () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    void getRecentActivity({
      limit: 200,
      profileId: activeProfileId,
    })
      .then(setActivity)
      .catch((err) => {
        console.error("Failed to fetch activity:", err);
        setError("Failed to load activity. Please try again.");
      })
      .finally(() => setIsLoading(false));
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Card className="flex min-h-0 flex-1 flex-col shadow-none">
          <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <p className="mb-4 text-sm text-danger">{error}</p>
            <Button variant="outline" size="sm" onClick={retryFetch}>
              <IconLoader2 size={16} className="mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (filteredAndSortedActivity.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {hasFilters ? <FilteredActivityEmptyState /> : <NoActivityEmptyState />}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col shadow-none">
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
          <div className="flex flex-col gap-1">
            {filteredAndSortedActivity.map((item) => (
              <ActivityEventRow key={item.id} item={item} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// events-specific filters + sort dropdowns
export function EventsRightSection() {
  const [params, setParams] = useQueryStates(eventsSearchParams);

  return (
    <div className="flex items-center gap-2">
      <EventsFiltersDropdown
        types={params.types}
        range={params.range}
        onTypesChange={(types) => setParams({ types })}
        onRangeChange={(range) => setParams({ range })}
        onReset={() => setParams({ types: [], range: "all" })}
      />
      <EventsSortDropdown
        sortDir={params.sortDir}
        onSortDirChange={(sortDir) => setParams({ sortDir })}
      />
    </div>
  );
}

function EventsFiltersDropdown({
  types,
  range,
  onTypesChange,
  onRangeChange,
  onReset,
}: {
  types: EventType[];
  range: EventDatePreset;
  onTypesChange: (types: EventType[]) => void;
  onRangeChange: (range: EventDatePreset) => void;
  onReset: () => void;
}) {
  const activeFilterCount =
    (types.length > 0 ? 1 : 0) + (range !== "all" ? 1 : 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-2">
          <IconFilter size={16} />
          Filters
          <FacetedFilterBadge count={activeFilterCount} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconCalendar size={16} />
            Date Range
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={range}
              onValueChange={(v) => {
                const preset = DATE_PRESETS.find((p) => p === v);
                if (preset) onRangeChange(preset);
              }}
            >
              {DATE_PRESETS.map((preset) => {
                const DateIcon = EVENT_DATE_ICONS[preset];
                return (
                  <DropdownMenuRadioItem key={preset} value={preset}>
                    <FacetedFilterOption icon={<DateIcon size={16} />}>
                      {EVENT_DATE_PRESET_LABELS[preset]}
                    </FacetedFilterOption>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconList size={16} />
            Event Types
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {EVENT_TYPES.map((type) => {
              const TypeIcon = EVENT_TYPE_ICONS[type];
              return (
                <DropdownMenuCheckboxItem
                  key={type}
                  checked={types.includes(type)}
                  onCheckedChange={() =>
                    onTypesChange(toggleArrayItem(types, type))
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  <FacetedFilterOption icon={<TypeIcon size={16} />}>
                    {EVENT_TYPE_LABELS[type]}
                  </FacetedFilterOption>
                </DropdownMenuCheckboxItem>
              );
            })}
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
              Clear filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EventsSortDropdown({
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
