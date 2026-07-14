"use client";

import { Button, Checkbox, cn, TabsPrimitive } from "@vmem/ui";
import {
  formatListItemKindLabel,
  LIST_ITEM_KINDS,
  type ListItemKind,
} from "@/lib/list-items";
import { nodeColor } from "../graph-colors";
import ShapeIndicator from "../ShapeIndicator";
import { isCheckedByDefault, toggleCheckedByDefault } from "./checkedByDefault";

interface KindTabProps {
  selectedKinds: ListItemKind[];
  onKindsChange?: (kinds: ListItemKind[]) => void;
  kindCounts: Record<ListItemKind, number>;
  totalCount: number;
  isDark: boolean;
}

export default function KindTab({
  selectedKinds,
  onKindsChange,
  kindCounts,
  totalCount,
  isDark,
}: KindTabProps) {
  const toggleKind = (kind: ListItemKind) => {
    onKindsChange?.(
      toggleCheckedByDefault(selectedKinds, kind, LIST_ITEM_KINDS),
    );
  };

  return (
    <TabsPrimitive.Content
      value="kind"
      className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
    >
      <div className="p-2 border-b border-separator">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onKindsChange?.([])}
          className={cn(
            "h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors active:scale-100",
            selectedKinds.length === 0
              ? "bg-surface-secondary font-medium text-foreground hover:bg-surface-secondary"
              : "hover:bg-surface-tertiary",
          )}
        >
          All kinds
          <span className="ml-auto text-muted/50 tabular-nums">
            {totalCount}
          </span>
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {LIST_ITEM_KINDS.map((kind) => {
          const checked = isCheckedByDefault(selectedKinds, kind);
          const color = nodeColor(
            [],
            kind === "wiki-artifact" ? "wiki-document" : kind,
            isDark,
            null,
          );
          return (
            <label
              key={kind}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-separator last:border-0 hover:bg-surface-tertiary"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggleKind(kind)}
              />
              <ShapeIndicator kind={kind} color={color} />
              <span className="flex-1 text-xs truncate">
                {formatListItemKindLabel(kind)}
              </span>
              <span className="text-xs text-muted/50 tabular-nums">
                {kindCounts[kind]}
              </span>
            </label>
          );
        })}
      </div>
    </TabsPrimitive.Content>
  );
}
