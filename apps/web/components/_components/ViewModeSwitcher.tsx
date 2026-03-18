"use client";

import { useCallback } from "react";
import {
  IconGraph,
  IconSatellite,
  IconStars,
  IconGridDots,
  IconCircleDot,
} from "@tabler/icons-react";
import type { ViewMode } from "./graph-view-themes";
import { VIEW_MODE_LABELS } from "./graph-view-themes";

interface ViewModeSwitcherProps {
  activeMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { mode: ViewMode; Icon: typeof IconGraph }[] = [
  { mode: "default", Icon: IconGraph },
  { mode: "satellite", Icon: IconSatellite },
  { mode: "constellation", Icon: IconStars },
  { mode: "blueprint", Icon: IconGridDots },
  { mode: "minimal", Icon: IconCircleDot },
];

export default function ViewModeSwitcher({
  activeMode,
  onChange,
}: ViewModeSwitcherProps) {
  const handleClick = useCallback(
    (mode: ViewMode) => () => {
      onChange(mode);
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-background/50 backdrop-blur-sm border border-border/30 p-0.5">
      {MODES.map(({ mode, Icon }) => (
        <button
          key={mode}
          type="button"
          onClick={handleClick(mode)}
          title={VIEW_MODE_LABELS[mode]}
          className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
            mode === activeMode
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
