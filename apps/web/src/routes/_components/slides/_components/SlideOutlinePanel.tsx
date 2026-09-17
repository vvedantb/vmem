import { useEffect, useRef, useState } from "react";
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpandFilled,
} from "@tabler/icons-react";
import { Button, cn } from "@vmem/ui";
import { SLIDES } from "../slides/index";

interface SlideOutlinePanelProps {
  slide: number;
  onNavigate: (slide: number) => void;
  hidden?: boolean;
}

/**
 * PowerPoint-style slide list — scroll the outline and click to jump.
 * Collapsible so the stage can use full width when presenting.
 */
export function SlideOutlinePanel({
  slide,
  onNavigate,
  hidden = false,
}: SlideOutlinePanelProps) {
  const [open, setOpen] = useState(true);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || hidden) return;
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [slide, open, hidden]);

  if (hidden) return null;

  if (!open) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center bg-background py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          className="text-muted hover:bg-surface-tertiary/50 hover:text-foreground"
          aria-label="Show slide list"
        >
          <IconLayoutSidebarLeftExpandFilled size={18} stroke={1.5} />
        </Button>
      </div>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-background lg:w-60">
      <div className="flex items-center justify-between px-3 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          Slides
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(false)}
          className="text-muted hover:bg-surface-tertiary/50 hover:text-foreground"
          aria-label="Hide slide list"
        >
          <IconLayoutSidebarLeftCollapse size={17} stroke={1.5} />
        </Button>
      </div>

      <nav
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
        aria-label="Slide outline"
      >
        <ul className="space-y-1">
          {SLIDES.map((entry, i) => {
            const slideNumber = i + 1;
            const isActive = slideNumber === slide;

            return (
              <li key={entry.id}>
                <Button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  variant="ghost"
                  onClick={() => onNavigate(slideNumber)}
                  className={cn(
                    "h-auto w-full justify-start gap-2.5 rounded-xl px-2 py-2 text-left",
                    isActive
                      ? "bg-surface-tertiary hover:bg-surface-tertiary"
                      : "hover:bg-surface-tertiary/50",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex aspect-video w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-lg",
                      entry.theme === "dark"
                        ? "bg-foreground text-background"
                        : "bg-surface-secondary text-foreground",
                    )}
                  >
                    <span className="font-mono text-[10px] tabular-nums opacity-60">
                      {slideNumber}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 py-0.5">
                    <span
                      className={cn(
                        "block truncate text-xs font-medium",
                        isActive ? "text-foreground" : "text-muted",
                      )}
                    >
                      {entry.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-muted/70">
                      {entry.id}
                    </span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
