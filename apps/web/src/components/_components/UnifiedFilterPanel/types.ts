import type { Memory, MemoryType, TagSortMode, TagStats } from "@/lib/memories";
import type { ListItem, ListItemKind } from "@/lib/list-items";

type FilterTab = "kind" | "tags" | "source" | "type";

export const TAG_SORT_LABELS: Record<TagSortMode, string> = {
  "a-z": "A–Z",
  "most-used": "Most used",
  "most-recent": "Most recent",
};

export const TAG_SORT_OPTIONS: TagSortMode[] = [
  "a-z",
  "most-used",
  "most-recent",
];

export interface UnifiedFilterPanelProps {
  // all memories for tag/source/type counts (list view)
  allMemories?: Memory[];
  // all items (memories + wiki + skills) for kind counts (list view)
  allItems?: ListItem[];

  // kinds supports both array (list) and Set (graph) styles
  selectedKinds?: ListItemKind[];
  onKindsChange?: (kinds: ListItemKind[]) => void;
  // graph-style kind counts if provided, used instead of computing from allItems
  kindCounts?: Record<ListItemKind, number>;

  // tags supports both array (list) and Set (graph) styles
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
  // graph-style tag stats if provided, used instead of computing from allMemories
  tagStats?: TagStats[];

  // sources (list view only)
  distinctSources?: string[];
  selectedSources?: string[];
  onSourcesChange?: (sources: string[]) => void;

  // types (list view only)
  selectedTypes?: MemoryType[];
  onTypesChange?: (types: MemoryType[]) => void;
  // graph-style type counts if provided, used instead of computing from allMemories
  typeCounts?: Record<MemoryType, number>;

  // result count
  filteredCount: number;
  totalCount: number;

  // reset every filter at once
  onClearAll: () => void;

  isDark: boolean;

  // which tabs to show
  visibleTabs?: FilterTab[];
}
