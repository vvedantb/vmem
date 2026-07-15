import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  cn,
} from "@vmem/ui";
import {
  IconCheck,
  IconChevronDown,
  IconCalendar,
  IconLayoutGrid,
  IconLetterA,
  IconList,
  IconPlus,
  IconRuler2,
  IconSortAscending,
  IconSortDescending,
  IconFolderPlus,
  IconUpload,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";
import type { FileView, FileSortField, SortDirection } from "./search-params";

const SORT_FIELDS: ReadonlyArray<{
  sort: FileSortField;
  label: string;
  icon: TablerIcon;
  directions: ReadonlyArray<{ sortDir: SortDirection; label: string }>;
}> = [
  {
    sort: "name",
    label: "Name",
    icon: IconLetterA,
    directions: [
      { sortDir: "asc", label: "A–Z" },
      { sortDir: "desc", label: "Z–A" },
    ],
  },
  {
    sort: "size",
    label: "Size",
    icon: IconRuler2,
    directions: [
      { sortDir: "asc", label: "Smallest first" },
      { sortDir: "desc", label: "Largest first" },
    ],
  },
  {
    sort: "date",
    label: "Date",
    icon: IconCalendar,
    directions: [
      { sortDir: "asc", label: "Oldest first" },
      { sortDir: "desc", label: "Newest first" },
    ],
  },
];

const SORT_FIELD_LABELS: Record<FileSortField, string> = {
  name: "Name",
  size: "Size",
  date: "Date",
};

const SORT_DIR_ICONS = {
  asc: IconSortAscending,
  desc: IconSortDescending,
} as const;

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
  const SortIcon = SORT_DIR_ICONS[sortDir];

  return (
    <div className="flex items-center gap-2">
      <Tabs
        value={view}
        onValueChange={(v) => {
          if (v === "grid" || v === "list") onViewChange(v);
        }}
      >
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
            <SortIcon size={16} stroke={1.5} className="text-muted" />
            {SORT_FIELD_LABELS[sort]}
            <IconChevronDown size={14} className="text-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          {SORT_FIELDS.map((field) => {
            const FieldIcon = field.icon;
            return (
              <DropdownMenuSub key={field.sort}>
                <DropdownMenuSubTrigger>
                  <FieldIcon size={16} className="text-muted" />
                  {field.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {field.directions.map((direction) => {
                    const isActive =
                      sort === field.sort && sortDir === direction.sortDir;
                    return (
                      <DropdownMenuItem
                        key={direction.sortDir}
                        onSelect={() =>
                          onSortSelect(field.sort, direction.sortDir)
                        }
                        className={cn(isActive && "bg-surface-tertiary/80")}
                      >
                        {direction.label}
                        {isActive ? (
                          <IconCheck size={16} className="ml-auto" />
                        ) : null}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <IconPlus size={16} />
            Add
            <IconChevronDown size={14} className="text-muted" />
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
