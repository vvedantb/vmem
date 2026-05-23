"use client";

import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@vmem/ui";
import {
  IconChevronDown,
  IconLayoutGrid,
  IconList,
  IconPlus,
  IconSortAscending,
  IconSortDescending,
  IconFolderPlus,
  IconUpload,
} from "@tabler/icons-react";
import type { FileView, FileSortField, SortDirection } from "./-searchParams";

const SORT_OPTIONS: ReadonlyArray<{
  sort: FileSortField;
  sortDir: SortDirection;
  label: string;
}> = [
  { sort: "name", sortDir: "asc", label: "Name (A–Z)" },
  { sort: "name", sortDir: "desc", label: "Name (Z–A)" },
  { sort: "size", sortDir: "asc", label: "Size (smallest first)" },
  { sort: "size", sortDir: "desc", label: "Size (largest first)" },
  { sort: "date", sortDir: "asc", label: "Date (oldest first)" },
  { sort: "date", sortDir: "desc", label: "Date (newest first)" },
];

function sortOptionKey(sort: FileSortField, sortDir: SortDirection): string {
  return `${sort}:${sortDir}`;
}

function parseSortOptionKey(
  key: string,
): { sort: FileSortField; sortDir: SortDirection } | null {
  const match = SORT_OPTIONS.find(
    (option) => sortOptionKey(option.sort, option.sortDir) === key,
  );
  return match ?? null;
}

const SORT_FIELD_LABELS: Record<FileSortField, string> = {
  name: "Name",
  size: "Size",
  date: "Date",
};

interface FileToolbarProps {
  view: FileView;
  sort: FileSortField;
  sortDir: SortDirection;
  onViewChange: (view: FileView) => void;
  onSortSelect: (sort: FileSortField, sortDir: SortDirection) => void;
  onNewFolder: () => void;
  onUpload: () => void;
}

export default function FileToolbar({
  view,
  sort,
  sortDir,
  onViewChange,
  onSortSelect,
  onNewFolder,
  onUpload,
}: FileToolbarProps) {
  const SortIcon = sortDir === "asc" ? IconSortAscending : IconSortDescending;

  return (
    <div className="flex items-center gap-2">
      <Tabs value={view} onValueChange={(v) => onViewChange(v as FileView)}>
        <TabsList className="h-8">
          <TabsTrigger value="grid" className="h-6 px-2">
            <IconLayoutGrid size={15} />
          </TabsTrigger>
          <TabsTrigger value="list" className="h-6 px-2">
            <IconList size={15} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <SortIcon
              size={16}
              stroke={1.5}
              className="text-muted-foreground"
            />
            {SORT_FIELD_LABELS[sort]}
            <IconChevronDown size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuRadioGroup
            value={sortOptionKey(sort, sortDir)}
            onValueChange={(key) => {
              const parsed = parseSortOptionKey(key);
              if (parsed) {
                onSortSelect(parsed.sort, parsed.sortDir);
              }
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuRadioItem
                key={sortOptionKey(option.sort, option.sortDir)}
                value={sortOptionKey(option.sort, option.sortDir)}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <IconPlus size={16} />
            Add
            <IconChevronDown size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onNewFolder}>
            <IconFolderPlus size={16} />
            New folder
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onUpload}>
            <IconUpload size={16} />
            Upload files
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
