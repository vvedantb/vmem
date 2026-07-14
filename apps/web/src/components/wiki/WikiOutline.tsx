"use client";

import { useEffect, useRef } from "react";
import { Button, cn } from "@vmem/ui";
import type { OutlineHeading } from "./_utils";
import { useWikiSidebar } from "./WikiSidebarContext";

interface WikiOutlineProps {
  headings: OutlineHeading[];
  /** Heading the reader is currently scrolled to — highlighted with an accent rail. */
  activeHeadingId: string | null;
  onJump: (pos: number) => void;
}

/**
 * Per-level label opacity: H1 anchors the structure (full), deeper levels fade so
 * the hierarchy reads at a glance. Tailwind's `text-foreground/NN` is a no-op here
 * (the oklch token ignores the alpha modifier), so fade the label span directly.
 * The active heading always renders at full opacity, regardless of level.
 */
function labelOpacity(level: number): number {
  if (level <= 1) return 1;
  if (level === 2) return 0.75;
  return 0.55;
}

/**
 * Right-pane outline: flat list of headings extracted from the editor JSON.
 * Click a heading to scroll the editor to it; the active heading follows the
 * reader's scroll position (scroll-spy lives in WikiEditor).
 *
 * Indentation is level-based (h1 flush, h2 +12px, etc.) — matches Obsidian.
 */
export default function WikiOutline({
  headings,
  activeHeadingId,
  onJump,
}: WikiOutlineProps) {
  const { hasDoc } = useWikiSidebar();
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Keep the active row in view as the reader scrolls the document.
  useEffect(() => {
    if (!activeHeadingId) return;
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeHeadingId]);

  if (!hasDoc) {
    return <p className="px-2 py-3 text-xs text-muted">No document open.</p>;
  }

  if (headings.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-muted">
        Add a heading to build the outline.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {headings.map((heading) => {
        const isActive = heading.id === activeHeadingId;
        const isMedium = isActive || heading.level <= 1;
        return (
          <li key={heading.id} className="relative">
            {isActive ? (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent"
              />
            ) : null}
            <Button
              ref={isActive ? activeRef : undefined}
              type="button"
              variant="ghost"
              onClick={() => onJump(heading.pos)}
              aria-current={isActive ? "location" : undefined}
              className={cn(
                "block h-auto w-full justify-start rounded-md py-1 pr-2 text-left text-sm font-normal text-foreground transition-[background-color,color] active:scale-100",
                isMedium ? "font-medium" : "font-normal",
                isActive
                  ? "bg-surface-tertiary hover:bg-surface-tertiary"
                  : "hover:bg-surface-tertiary/50",
              )}
              style={{ paddingLeft: `${(heading.level - 1) * 12 + 10}px` }}
            >
              <span
                className="block truncate"
                style={{ opacity: isActive ? 1 : labelOpacity(heading.level) }}
              >
                {heading.text}
              </span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
