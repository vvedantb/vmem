// codebase graph header controls

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
import { FacetedFilterBadge } from "@/components/_components/FacetedFilter";
import { DirectoryFilter } from "./DirectoryFilter";
import type { CodebaseGraphController } from "@/hooks/useCodebaseGraphController";
import type { CodeNode, CodeNodeKind } from "./-types";

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

const DEFAULT_KINDS: CodeNodeKind[] = [
  "code-file",
  "code-function",
  "code-class",
];

function codebaseActiveFilterCount(
  controller: CodebaseGraphController,
): number {
  let count = 0;
  if (controller.activeKinds.size !== DEFAULT_KINDS.length) {
    count += 1;
  } else {
    for (const kind of DEFAULT_KINDS) {
      if (!controller.activeKinds.has(kind)) {
        count += 1;
        break;
      }
    }
  }
  if (controller.processId) count += 1;
  if (controller.selectedSymbolId) count += 1;
  return count;
}

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
    onClearFilters,
    isDark,
  } = controller;

  const activeFilterCount = codebaseActiveFilterCount(controller);

  // derive the process picker options from the current payload
  const processOptions = apiNodes
    .filter(
      (n): n is CodeNode & { kind: "code-process" } =>
        n.kind === "code-process",
    )
    .sort((a, b) => a.name.localeCompare(b.name));

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
          <FacetedFilterBadge count={activeFilterCount} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[calc(100vw-1rem)] max-w-[360px] p-3 sm:w-[360px] space-y-3"
      >
        {
          // kinds
        }
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

        {
          // process picker
        }
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

        {
          // directories
        }
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

        {
          // reset
        }
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
