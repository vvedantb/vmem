import {
  IconZoomIn,
  IconZoomOut,
  IconFocusCentered,
} from "@tabler/icons-react";
import { Button, cn } from "@vmem/ui";

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
  const btnClass = cn(
    "h-8 w-8",
    isDarkCanvas
      ? "bg-surface-secondary/80 text-foreground hover:bg-surface-tertiary"
      : "bg-surface-secondary/40 text-muted hover:bg-surface-tertiary/50 hover:text-foreground",
  );

  return (
    <div className="absolute bottom-3 left-3 z-10 hidden md:flex flex-col gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onZoomIn}
        className={btnClass}
        aria-label="Zoom in"
      >
        <IconZoomIn size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onZoomOut}
        className={btnClass}
        aria-label="Zoom out"
      >
        <IconZoomOut size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onFit}
        className={btnClass}
        aria-label="Fit graph to view"
      >
        <IconFocusCentered size={16} />
      </Button>
    </div>
  );
}
