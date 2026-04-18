"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@vmem/ui";
import { IconLayersIntersect, IconShape } from "@tabler/icons-react";
import {
  formatListItemKindLabel,
  LIST_ITEM_KINDS,
  listItemMatchesKindFilter,
  type ListItem,
  type ListItemKind,
} from "@/lib/list-items";
import { nodeColor } from "./graph-colors";
import ShapeIndicator from "./ShapeIndicator";

interface ListKindFilterProps {
  baseItems: ListItem[];
  selectedKinds: ListItemKind[];
  onKindsChange: (kinds: ListItemKind[]) => void;
  isDark: boolean;
}

/**
 * Popover kind filter for the list view — lets users narrow by memory / wiki
 * doc / folder / skill. Mirrors MemoryTypeFilter's UX but renders shape swatches
 * beside each row so the list view reads the same visual language as the graph.
 */
export default function ListKindFilter({
  baseItems,
  selectedKinds,
  onKindsChange,
  isDark,
}: ListKindFilterProps) {
  const [open, setOpen] = useState(false);

  const kindCounts = useMemo(() => {
    const counts: Record<ListItemKind, number> = {
      memory: 0,
      "wiki-document": 0,
      "wiki-folder": 0,
      skill: 0,
    };
    for (const item of baseItems) {
      counts[item.kind] += 1;
    }
    return counts;
  }, [baseItems]);

  const toggleKind = (kind: ListItemKind) => {
    if (selectedKinds.includes(kind)) {
      onKindsChange(selectedKinds.filter((k) => k !== kind));
    } else {
      onKindsChange([...selectedKinds, kind]);
    }
  };

  const filteredCount = useMemo(() => {
    if (selectedKinds.length === 0) {
      return baseItems.length;
    }
    return baseItems.filter((item) =>
      listItemMatchesKindFilter(item, selectedKinds),
    ).length;
  }, [baseItems, selectedKinds]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-12 shrink-0 gap-1.5 px-3",
            selectedKinds.length > 0 && "border-primary text-primary",
          )}
        >
          <IconShape size={18} stroke={1.5} />
          Kind
          {selectedKinds.length > 0 ? (
            <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-medium tabular-nums">
              {selectedKinds.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 flex flex-col">
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onKindsChange([])}
            className={cn(
              "justify-start gap-2 h-9 px-2 font-normal",
              selectedKinds.length === 0 &&
                "bg-accent text-accent-foreground font-medium",
            )}
          >
            <IconLayersIntersect size={16} stroke={1.5} />
            <span className="truncate">All kinds</span>
            <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums">
              {baseItems.length}
            </span>
          </Button>
          <span className="text-xs text-muted-foreground px-1">Kinds</span>
        </div>
        <div className="flex flex-col">
          {LIST_ITEM_KINDS.map((kind) => {
            const checked = selectedKinds.includes(kind);
            const color = nodeColor([], kind, isDark, null);
            return (
              <label
                key={kind}
                className="flex h-9 cursor-pointer items-center gap-2 border-b border-border/40 px-3 last:border-0"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleKind(kind)}
                />
                <ShapeIndicator kind={kind} color={color} />
                <span className="flex min-w-0 flex-1 items-center text-xs font-normal">
                  <span className="truncate">
                    {formatListItemKindLabel(kind)}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground/50 tabular-nums">
                    {kindCounts[kind]}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {selectedKinds.length === 0
            ? `Showing all ${baseItems.length} ${baseItems.length === 1 ? "item" : "items"}`
            : `Matching ${filteredCount} ${filteredCount === 1 ? "item" : "items"}`}
        </div>
      </PopoverContent>
    </Popover>
  );
}
