"use client";

/**
 * Codebase-graph controls rendered in the page header.
 *
 * Two popover buttons — Search and Directories — keep the graph canvas free
 * of overlay chrome. Reads everything from a `useCodebaseGraphController`.
 */

import { IconSearch, IconFolderSearch } from "@tabler/icons-react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@vmem/ui";
import type { CodebaseGraphController } from "@/hooks/useCodebaseGraphController";
import { DirectoryFilter } from "./DirectoryFilter";

interface CodebaseGraphHeaderControlsProps {
  controller: CodebaseGraphController;
}

export default function CodebaseGraphHeaderControls({
  controller,
}: CodebaseGraphHeaderControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <SearchPopover
        search={controller.search}
        onSearchChange={controller.onSearchChange}
        active={controller.hasActiveSearch}
      />
      <DirectoriesPopover controller={controller} />
    </div>
  );
}

function SearchPopover({
  search,
  onSearchChange,
  active,
}: {
  search: string;
  onSearchChange: (q: string) => void;
  active: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Search files"
          className="relative"
        >
          <IconSearch size={16} />
          {active && (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="relative">
          <IconSearch
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files..."
            autoFocus
            className="h-8 pl-8 text-xs bg-background/50"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DirectoriesPopover({
  controller,
}: {
  controller: CodebaseGraphController;
}) {
  const {
    directories,
    activeDirectories,
    onToggleDirectory,
    onSelectAllDirs,
    onClearAllDirs,
    hasActiveDirectoryFilter,
    isDark,
  } = controller;

  if (directories.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Filter directories"
          className="relative"
        >
          <IconFolderSearch size={16} />
          {hasActiveDirectoryFilter && (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <DirectoryFilter
          directories={directories}
          activeDirectories={activeDirectories}
          onToggle={onToggleDirectory}
          onSelectAll={onSelectAllDirs}
          onClearAll={onClearAllDirs}
          isDark={isDark}
        />
      </PopoverContent>
    </Popover>
  );
}
