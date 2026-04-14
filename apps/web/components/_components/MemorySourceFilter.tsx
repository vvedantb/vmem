"use client";

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@vmem/ui";
import { IconPlug } from "@tabler/icons-react";
import { formatMemorySourceLabel } from "@/lib/memories";

interface MemorySourceFilterProps {
  sources: string[];
  selectedSource: string | null;
  onSourceChange: (source: string | null) => void;
}

export default function MemorySourceFilter({
  sources,
  selectedSource,
  onSourceChange,
}: MemorySourceFilterProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-12 shrink-0 gap-1.5 px-3 max-w-[160px]",
            selectedSource !== null && "border-primary text-primary",
          )}
        >
          <IconPlug size={18} stroke={1.5} className="shrink-0" />
          <span className="truncate">
            {selectedSource !== null
              ? formatMemorySourceLabel(selectedSource)
              : "Source"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        <DropdownMenuItem
          onClick={() => onSourceChange(null)}
          className={cn(
            selectedSource === null ? "font-medium text-foreground" : "",
          )}
        >
          All sources
        </DropdownMenuItem>
        {sources.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => onSourceChange(s)}
            className={cn(
              selectedSource === s ? "font-medium text-foreground" : "",
            )}
          >
            {formatMemorySourceLabel(s)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
