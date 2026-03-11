"use client";

import { useEffect, useRef, useCallback } from "react";
import Sigma from "sigma";
import type Graph from "graphology";
import { Button } from "@vmem/ui";
import { IconZoomIn, IconZoomOut, IconFocus2 } from "@tabler/icons-react";
import type {
  NodeAttributes,
  EdgeAttributes,
  HoveredNodeInfo,
  GraphThemeColors,
} from "./graph-types";
import type { KeyboardEvent } from "react";

interface GraphRendererProps {
  graph: Graph<NodeAttributes, EdgeAttributes>;
  onHoverNode: (info: HoveredNodeInfo | null) => void;
  onClickNode: (nodeId: string) => void;
  themeColors: GraphThemeColors;
  nodeCount: number;
  connectionCount: number;
}

export default function GraphRenderer({
  graph,
  onHoverNode,
  onClickNode,
  themeColors,
  nodeCount,
  connectionCount,
}: GraphRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma<NodeAttributes, EdgeAttributes> | null>(null);
  const keyboardIndexRef = useRef<number>(-1);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new Sigma<NodeAttributes, EdgeAttributes>(
      graph,
      containerRef.current,
      {
        renderEdgeLabels: false,
        defaultEdgeColor: themeColors.edgeColor,
        defaultNodeColor: themeColors.defaultNodeColor,
        labelColor: { color: themeColors.labelColor },
        labelFont:
          getComputedStyle(containerRef.current).fontFamily ||
          "system-ui, sans-serif",
        labelSize: 12,
        labelRenderedSizeThreshold: 6,
        minCameraRatio: 0.08,
        maxCameraRatio: 3,
      },
    );

    sigmaRef.current = renderer;

    renderer.on("enterNode", ({ node }) => {
      const displayData = renderer.getNodeDisplayData(node);
      if (!displayData) return;
      const attrs = graph.getNodeAttributes(node);
      onHoverNode({
        id: node,
        title: attrs.label,
        content: attrs.content,
        viewportX: displayData.x,
        viewportY: displayData.y,
      });
    });

    renderer.on("leaveNode", () => {
      onHoverNode(null);
    });

    renderer.on("clickNode", ({ node }) => {
      onClickNode(node);
    });

    return () => {
      renderer.kill();
      sigmaRef.current = null;
    };
  }, [graph, themeColors, onHoverNode, onClickNode]);

  const zoomIn = useCallback(() => {
    sigmaRef.current?.getCamera().animatedZoom({ duration: 300 });
  }, []);

  const zoomOut = useCallback(() => {
    sigmaRef.current?.getCamera().animatedUnzoom({ duration: 300 });
  }, []);

  const resetCamera = useCallback(() => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const nodeIds = graph.nodes();
      if (nodeIds.length === 0) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        keyboardIndexRef.current =
          (keyboardIndexRef.current + 1) % nodeIds.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        keyboardIndexRef.current =
          (keyboardIndexRef.current - 1 + nodeIds.length) % nodeIds.length;
      } else if (e.key === "Enter" && keyboardIndexRef.current >= 0) {
        e.preventDefault();
        onClickNode(nodeIds[keyboardIndexRef.current]);
        return;
      } else if (e.key === "Escape") {
        keyboardIndexRef.current = -1;
        onHoverNode(null);
        return;
      } else {
        return;
      }

      const nodeId = nodeIds[keyboardIndexRef.current];
      const attrs = graph.getNodeAttributes(nodeId);
      const displayData = sigmaRef.current?.getNodeDisplayData(nodeId);
      if (displayData) {
        sigmaRef.current
          ?.getCamera()
          .animate({ x: displayData.x, y: displayData.y }, { duration: 200 });
        onHoverNode({
          id: nodeId,
          title: attrs.label,
          content: attrs.content,
          viewportX: displayData.x,
          viewportY: displayData.y,
        });
      }
    },
    [graph, onHoverNode, onClickNode],
  );

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden rounded-xl border border-border"
      tabIndex={0}
      role="application"
      aria-label="Memory graph. Use arrow keys to navigate nodes, Enter to select, Escape to clear."
      onKeyDown={handleKeyDown}
    >
      <div ref={containerRef} className="w-full h-full bg-background" />

      <div className="absolute top-4 left-4 flex gap-3 text-xs text-muted-foreground pointer-events-none">
        <span>{nodeCount} memories</span>
        <span>{connectionCount} connections</span>
      </div>

      <div className="absolute top-4 right-4 flex gap-1.5">
        <Button
          size="icon-sm"
          variant="secondary"
          onClick={zoomIn}
          aria-label="Zoom in"
          className="bg-background/80 border border-border"
        >
          <IconZoomIn size={16} />
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          onClick={zoomOut}
          aria-label="Zoom out"
          className="bg-background/80 border border-border"
        >
          <IconZoomOut size={16} />
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          onClick={resetCamera}
          aria-label="Reset view"
          className="bg-background/80 border border-border"
        >
          <IconFocus2 size={16} />
        </Button>
      </div>

      <div className="absolute bottom-4 left-4 text-xs text-muted-foreground pointer-events-none">
        Click node to view details &bull; Drag to pan &bull; Scroll to zoom
        &bull; Arrow keys to navigate
      </div>
    </div>
  );
}
