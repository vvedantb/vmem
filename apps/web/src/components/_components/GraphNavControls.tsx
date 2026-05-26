"use client";

import {
  IconZoomIn,
  IconZoomOut,
  IconFocusCentered,
} from "@tabler/icons-react";

interface GraphNavControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  isDarkCanvas: boolean;
}

export default function GraphNavControls({
  onZoomIn,
  onZoomOut,
  onFit,
  isDarkCanvas,
}: GraphNavControlsProps) {
  const btnClass = isDarkCanvas
    ? "w-8 h-8 flex items-center justify-center rounded-lg bg-surface-secondary/80 hover:bg-surface-secondary text-foreground transition-colors"
    : "w-8 h-8 flex items-center justify-center rounded-lg bg-surface-secondary/40 hover:bg-surface-secondary/60 text-muted hover:text-foreground transition-colors";

  return (
    <div className="absolute bottom-3 left-3 z-10 hidden md:flex flex-col gap-1">
      <button type="button" onClick={onZoomIn} className={btnClass}>
        <IconZoomIn size={16} />
      </button>
      <button type="button" onClick={onZoomOut} className={btnClass}>
        <IconZoomOut size={16} />
      </button>
      <button type="button" onClick={onFit} className={btnClass}>
        <IconFocusCentered size={16} />
      </button>
    </div>
  );
}
