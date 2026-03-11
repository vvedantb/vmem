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
        labelFont: "system-ui, sans-serif",
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-shrink-0 flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{nodeCount} memories</span>
          <span>{connectionCount} connections</span>
        </div>
        <div className="flex gap-2">
          <Button
            size="icon-sm"
            variant="secondary"
            onClick={zoomIn}
            className="bg-muted border border-border"
          >
            <IconZoomIn size={16} />
          </Button>
          <Button
            size="icon-sm"
            variant="secondary"
            onClick={zoomOut}
            className="bg-muted border border-border"
          >
            <IconZoomOut size={16} />
          </Button>
          <Button
            size="icon-sm"
            variant="secondary"
            onClick={resetCamera}
            className="bg-muted border border-border"
          >
            <IconFocus2 size={16} />
          </Button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden rounded-xl border border-border">
        <div ref={containerRef} className="w-full h-full bg-background" />
        <div className="absolute bottom-4 left-4 text-xs text-muted-foreground pointer-events-none">
          Click node to view details &bull; Drag to pan &bull; Scroll to zoom
        </div>
      </div>
    </div>
  );
}
