"use client";

/**
 * Codebase-graph header controls.
 *
 * Two buttons in the page header:
 *   - Search field (separate per CLAUDE.md UI rules — search isn't a filter)
 *   - Filters popover with Kinds + Process + Directory sections (consolidated)
 *
 * The active-count badge on the Filters button counts each non-default field
 * as 1 (per CLAUDE.md UI rules), regardless of how many values it carries.
 * Search and directory are presentational — not counted there.
 */

import { useMemo } from "react";
import {
  IconFilter,
  IconFile,
  IconFunction,
  IconCube,
  IconHexagon,
  IconRoute,
} from "@tabler/icons-react";
import {
  Button,
  Checkbox,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@vmem/ui";
import HeaderSearchInput from "@/components/_components/HeaderSearchInput";
import { DirectoryFilter } from "./DirectoryFilter";
import type { CodebaseGraphController } from "@/hooks/useCodebaseGraphController";
import type { CodeNode, CodeNodeKind } from "@/hooks/useCodebaseGraphData";

interface CodebaseGraphHeaderControlsProps {
  controller: CodebaseGraphController;
}

const KIND_OPTIONS: {
  kind: CodeNodeKind;
  label: string;
  Icon: typeof IconFile;
}[] = [
  { kind: "code-file", label: "Files", Icon: IconFile },
  { kind: "code-function", label: "Functions", Icon: IconFunction },
  { kind: "code-class", label: "Classes", Icon: IconHexagon },
  { kind: "code-interface", label: "Interfaces", Icon: IconCube },
  { kind: "code-process", label: "Processes", Icon: IconRoute },
];

const NO_PROCESS_VALUE = "__none__";

export default function CodebaseGraphHeaderControls({
  controller,
}: CodebaseGraphHeaderControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <HeaderSearchInput
        value={controller.search}
        onChange={controller.onSearchChange}
        placeholder="Search symbols..."
        label="Search symbols"
      />
      <FiltersPopover controller={controller} />
    </div>
  );
}

// ---- Filters popover ----

function FiltersPopover({
  controller,
}: {
  controller: CodebaseGraphController;
}) {
  const {
    apiNodes,
    activeKinds,
    onToggleKind,
    processId,
    onSetProcess,
    directories,
    activeDirectories,
    onToggleDirectory,
    onSelectAllDirs,
    onClearAllDirs,
    activeFilterCount,
    onClearFilters,
    isDark,
  } = controller;

  // Derive the process picker options from the current payload. Even when the
  // user has hidden "code-process" via the kinds filter, the API still
  // returns processes (kinds filtering is client-side) so this list stays
  // populated regardless.
  const processOptions = useMemo(
    () =>
      apiNodes
        .filter(
          (n): n is CodeNode & { kind: "code-process" } =>
            n.kind === "code-process",
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [apiNodes],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Filter graph"
          className="relative"
        >
          <IconFilter size={16} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-[10px] font-medium tabular-nums text-accent-foreground flex items-center justify-center leading-none">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[calc(100vw-1rem)] max-w-[360px] p-3 sm:w-[360px] space-y-3"
      >
        {/* Kinds */}
        <div>
          <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
            Kinds
          </span>
          <div className="mt-1.5 grid grid-cols-1 gap-0.5">
            {KIND_OPTIONS.map(({ kind, label, Icon }) => {
              const checked = activeKinds.has(kind);
              return (
                <label
                  key={kind}
                  className="flex items-center gap-2 px-1 py-1 rounded hover:bg-surface-tertiary/50 cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleKind(kind)}
                    className="h-3.5 w-3.5"
                  />
                  <Icon size={14} className="text-muted" />
                  <span className="text-xs text-foreground flex-1">
                    {label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Process picker */}
        {processOptions.length > 0 && (
          <>
            <Separator />
            <div>
              <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                Process
              </span>
              <Select
                value={processId ?? NO_PROCESS_VALUE}
                onValueChange={(value) =>
                  onSetProcess(value === NO_PROCESS_VALUE ? null : value)
                }
              >
                <SelectTrigger className="h-8 mt-1.5 text-xs">
                  <SelectValue placeholder="All symbols" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROCESS_VALUE} className="text-xs">
                    All symbols
                  </SelectItem>
                  {processOptions.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={p.id}
                      className="text-xs font-mono"
                    >
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted mt-1.5">
                Limit the canvas to symbols reachable from a single entry-point.
              </p>
            </div>
          </>
        )}

        {/* Directories */}
        {directories.length > 0 && (
          <>
            <Separator />
            <DirectoryFilter
              directories={directories}
              activeDirectories={activeDirectories}
              onToggle={onToggleDirectory}
              onSelectAll={onSelectAllDirs}
              onClearAll={onClearAllDirs}
              isDark={isDark}
            />
          </>
        )}

        {/* Reset */}
        {activeFilterCount > 0 && (
          <>
            <Separator />
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="w-full h-8 text-xs"
            >
              Reset filters
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
