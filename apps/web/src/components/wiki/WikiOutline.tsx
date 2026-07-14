"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Button, cn } from "@vmem/ui";
import type { OutlineHeading } from "./_utils";

interface WikiOutlineProps {
  headings: OutlineHeading[];
  // heading the reader is currently scrolled to — highlighted with an accent rail
  activeHeadingId: string | null;
  onJump: (pos: number) => void;
}

// per-level label opacity
function labelOpacity(level: number): number {
  if (level <= 1) return 1;
  if (level === 2) return 0.75;
  return 0.55;
}

interface WikiOutlineRowProps {
  heading: OutlineHeading;
  isActive: boolean;
  activeRef: RefObject<HTMLButtonElement | null>;
  onJump: (pos: number) => void;
}

function WikiOutlineRow({
  heading,
  isActive,
  activeRef,
  onJump,
}: WikiOutlineRowProps) {
  const isMedium = isActive || heading.level <= 1;

  return (
    <li className="relative">
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
}

// right-pane outline: flat list of headings extracted from the editor JSON
export default function WikiOutline({
  headings,
  activeHeadingId,
  onJump,
}: WikiOutlineProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // keep the active row in view as the reader scrolls the document
  useEffect(() => {
    if (!activeHeadingId) return;
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeHeadingId]);

  if (headings.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-muted">
        Add a heading to build the outline.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {headings.map((heading) => (
        <WikiOutlineRow
          key={heading.id}
          heading={heading}
          isActive={heading.id === activeHeadingId}
          activeRef={activeRef}
          onJump={onJump}
        />
      ))}
    </ul>
  );
}
