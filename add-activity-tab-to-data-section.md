# Add Activity Tab to Data Section

## Context

Home page shows "Recent Activity" (6 items). User wants full activity logs page with filters/sort, accessible from sidebar's Data section.

## Files to Modify

### 1. `apps/web/src/components/sidebar/nav-config.ts`

- Import `IconActivity` from `@tabler/icons-react`
- Add to Data group after Usage:

```ts
{ href: "/activity", label: "Activity", icon: IconActivity }
```

### 2. Create `apps/web/src/routes/_main/activity/-searchParams.ts`

Follow pattern from `memories/-searchParams.ts` and `files/-searchParams.ts`:

```ts
import { parseAsArrayOf, parseAsStringLiteral } from "nuqs";

export const ACTIVITY_TYPES = [
  "memory_created",
  "memory_updated",
  "memory_deleted",
  "file_uploaded",
  "sync_completed",
  "api_key_created",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// Human-readable labels for UI
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  memory_created: "Memory Created",
  memory_updated: "Memory Updated",
  memory_deleted: "Memory Deleted",
  file_uploaded: "File Uploaded",
  sync_completed: "Sync Completed",
  api_key_created: "API Key Created",
};

const sortDirections = ["desc", "asc"] as const;
export type SortDirection = (typeof sortDirections)[number];

const datePresets = ["all", "today", "week", "month"] as const;
export type DatePreset = (typeof datePresets)[number];

export const activitySearchParams = {
  types: parseAsArrayOf(parseAsStringLiteral(ACTIVITY_TYPES), ",").withDefault(
    [],
  ),
  sortDir: parseAsStringLiteral(sortDirections).withDefault("desc"),
  range: parseAsStringLiteral(datePresets).withDefault("all"),
};
```

### 3. Create `apps/web/src/routes/_main/activity/index.tsx`

Pattern: memories/index.tsx + notifications.tsx.

```ts
const [params, setParams] = useQueryStates(activitySearchParams);
```

**Components (inline):**

- `ActivityPage` - main page using PageContainer
- `LoadingSkeleton` - 4 skeleton cards
- `EmptyState` - "No activity" message
- `ActivityFilters` - toolbar with filters + sort

**Filter UI (in PageContainer rightSection or above list):**

1. **Type filter** - Dropdown multi-select (DropdownMenu with checkboxes)
   - Button shows "All types" or "N types selected"
   - Checklist inside with ACTIVITY_TYPE_LABELS
2. **Date range** - Segmented button group or dropdown
   - "All time" | "Today" | "This week" | "This month"
3. **Sort toggle** - Button with IconSortDescending/IconSortAscending
   - Toggles between "Newest" / "Oldest"

**Data flow:**

1. Fetch all activity with `useAction(api.dashboardApi.getRecentActivity)` limit: 200
2. Client-side filter by `params.types` (if any selected)
3. Client-side filter by `params.range` (compare timestamp to preset ranges)
4. Client-side sort by `params.sortDir`

**Date preset logic (client-side):**

```ts
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
      return null; // "all"
  }
}
```

List rendering:

- Reuse `getActivityIcon(type)` from Dashboard.tsx (copy inline)
- Each item: icon | description | relativeTime
- Card style: `rounded-xl border border-border p-3 sm:p-6`

### ActivityItem interface (copy from Dashboard.tsx:34-41)

```ts
interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  relativeTime: string;
}
```

### getActivityIcon function (copy from Dashboard.tsx:82-96)

```ts
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
```

## No Backend Changes

Existing `getRecentActivity` action already accepts optional `limit` param. Pass limit: 200 for full history.

## URL Examples

- `/activity` - all activity, all time, newest first
- `/activity?types=memory_created,memory_updated` - only memory creates/updates
- `/activity?range=today` - today's activity only
- `/activity?range=week&sortDir=asc` - this week, oldest first
- `/activity?types=file_uploaded&range=month` - file uploads this month

## Verification

1. Nav: Activity appears in Data section after Usage
2. Route: /activity loads without errors
3. Data: Shows full activity list (not just 6)
4. Filters: Type filter chips work, URL updates
5. Sort: Toggle between newest/oldest, URL updates
6. Empty: Shows empty state when no activity (or no matches)
7. Loading: Shows skeleton while fetching
8. Shareable: Copy URL with filters, paste in new tab, filters persist
