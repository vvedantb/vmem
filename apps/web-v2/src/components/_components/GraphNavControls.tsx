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
    ? "w-8 h-8 flex items-center justify-center rounded-md bg-black/30 backdrop-blur-sm border border-white/10 hover:bg-black/50 text-white/70 hover:text-white transition-colors"
    : "w-8 h-8 flex items-center justify-center rounded-md bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors";

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
