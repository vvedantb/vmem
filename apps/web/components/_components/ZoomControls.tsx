"use client";

import { useCallback } from "react";
import { useCamera } from "@react-sigma/core";
import { Button } from "@vmem/ui";
import { IconZoomIn, IconZoomOut, IconFocus2 } from "@tabler/icons-react";

export default function ZoomControls() {
  const { zoomIn, zoomOut, reset } = useCamera();

  const handleZoomIn = useCallback(() => {
    zoomIn();
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut();
  }, [zoomOut]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={handleZoomIn}
        className="bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
      >
        <IconZoomIn size={14} />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={handleZoomOut}
        className="bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
      >
        <IconZoomOut size={14} />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={handleReset}
        className="bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
      >
        <IconFocus2 size={14} />
      </Button>
    </div>
  );
}
