"use client";

import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@vmem/ui";
import {
  IconLayoutGrid,
  IconList,
  IconSortAscending,
  IconSortDescending,
  IconFolderPlus,
  IconUpload,
} from "@tabler/icons-react";
import type { FileView, FileSortField, SortDirection } from "../searchParams";

interface FileToolbarProps {
  view: FileView;
  sort: FileSortField;
  sortDir: SortDirection;
  onViewChange: (view: FileView) => void;
  onSortChange: (sort: FileSortField) => void;
  onSortDirToggle: () => void;
  onNewFolder: () => void;
  onUpload: () => void;
}

export default function FileToolbar({
  view,
  sort,
  sortDir,
  onViewChange,
  onSortChange,
  onSortDirToggle,
  onNewFolder,
  onUpload,
}: FileToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      {/* View toggle */}
      <Tabs value={view} onValueChange={(v) => onViewChange(v as FileView)}>
        <TabsList className="h-8">
          <TabsTrigger value="grid" className="px-2 h-6">
            <IconLayoutGrid size={15} />
          </TabsTrigger>
          <TabsTrigger value="list" className="px-2 h-6">
            <IconList size={15} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Sort field */}
      <Select
        value={sort}
        onValueChange={(v) => onSortChange(v as FileSortField)}
      >
        <SelectTrigger className="h-8 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">Name</SelectItem>
          <SelectItem value="size">Size</SelectItem>
          <SelectItem value="date">Date</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort direction */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onSortDirToggle}
        className="text-muted-foreground"
      >
        {sortDir === "asc" ? (
          <IconSortAscending size={16} stroke={1.5} />
        ) : (
          <IconSortDescending size={16} stroke={1.5} />
        )}
      </Button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* New folder */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onNewFolder}
        className="text-muted-foreground"
      >
        <IconFolderPlus size={16} stroke={1.5} />
        <span className="hidden sm:inline">New Folder</span>
      </Button>

      {/* Upload */}
      <Button
        size="sm"
        onClick={onUpload}
        className="bg-primary text-primary-foreground"
      >
        <IconUpload size={16} stroke={1.5} />
        <span className="hidden sm:inline">Upload</span>
      </Button>
    </div>
  );
}
