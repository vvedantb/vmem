"use client";

import { IconLayoutSidebarRightCollapse } from "@tabler/icons-react";
import { cn } from "@vmem/ui";
import type { OutlineHeading } from "./_utils";

interface WikiOutlineProps {
  headings: OutlineHeading[];
  onJump: (pos: number) => void;
  hasDoc: boolean;
  onCollapse: () => void;
}

/**
 * Right-pane outline: flat list of headings extracted from the editor JSON.
 * Click a heading to scroll the editor to it.
 *
 * Indentation is level-based (h1 flush, h2 +8px, etc.) — matches Obsidian.
 */
export default function WikiOutline({
  headings,
  onJump,
  hasDoc,
  onCollapse,
}: WikiOutlineProps) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Outline
        </span>
        <button
          type="button"
          onClick={onCollapse}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted/70"
          title="Collapse outline"
        >
          <IconLayoutSidebarRightCollapse size={14} />
        </button>
      </div>
      {!hasDoc ? (
        <p className="px-2 py-3 text-xs text-muted-foreground">
          No document open.
        </p>
      ) : headings.length === 0 ? (
        <p className="px-2 py-3 text-xs text-muted-foreground">
          Add a heading to build the outline.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {headings.map((heading) => (
            <li key={heading.id}>
              <button
                type="button"
                onClick={() => onJump(heading.pos)}
                className={cn(
                  "w-full text-left text-sm rounded-md px-2 py-1 transition-colors",
                  "text-foreground/80 hover:bg-muted/70 hover:text-foreground",
                )}
                style={{ paddingLeft: `${(heading.level - 1) * 10 + 8}px` }}
              >
                <span className="truncate block">{heading.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
