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
}

const BTN =
  "w-8 h-8 flex items-center justify-center rounded-md bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors";

export default function GraphNavControls({
  onZoomIn,
  onZoomOut,
  onFit,
}: GraphNavControlsProps) {
  return (
    <div className="absolute bottom-3 left-3 z-10 hidden md:flex flex-col gap-1">
      <button type="button" onClick={onZoomIn} className={BTN}>
        <IconZoomIn size={16} />
      </button>
      <button type="button" onClick={onZoomOut} className={BTN}>
        <IconZoomOut size={16} />
      </button>
      <button type="button" onClick={onFit} className={BTN}>
        <IconFocusCentered size={16} />
      </button>
    </div>
  );
}
