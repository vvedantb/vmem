"use client";

import { useMemo, useState, useCallback } from "react";
import { SigmaContainer } from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import { Button } from "@vmem/ui";
import { IconZoomIn, IconZoomOut, IconFocus2 } from "@tabler/icons-react";
import type Graph from "graphology";
import type {
  NodeAttributes,
  EdgeAttributes,
  HoveredNodeInfo,
  GraphSettings,
} from "./graph-types";
import type { GraphViewTheme } from "./graph-view-themes";
import { themeToCSSBackground } from "./graph-view-themes";
import NodeGlowProgram from "./node-glow-program";
import GraphEventHandler from "./GraphEventHandler";
import HoverReducer from "./HoverReducer";
import NodeDragHandler from "./NodeDragHandler";
import LinkDragHandler from "./LinkDragHandler";
import LayoutController from "./LayoutController";
import ZoomControls from "./ZoomControls";

interface SigmaGraphProps {
  graph: Graph<NodeAttributes, EdgeAttributes>;
  viewTheme: GraphViewTheme;
  settings: GraphSettings;
  onHoverNode: (info: HoveredNodeInfo | null) => void;
  onClickNode: (nodeId: string) => void;
  onLinkNodes: (sourceId: string, targetId: string) => void;
}

export default function SigmaGraph({
  graph,
  viewTheme,
  settings,
  onHoverNode,
  onClickNode,
  onLinkNodes,
}: SigmaGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const bgStyle = useMemo(() => themeToCSSBackground(viewTheme), [viewTheme]);

  const sigmaSettings = useMemo(
    () => ({
      nodeProgramClasses: { glow: NodeGlowProgram },
      defaultNodeType: "glow",
      labelColor: { color: viewTheme.label.color },
      labelFont: '"Instrument Sans", system-ui, sans-serif',
      edgeColor: { attribute: "color" },
      defaultEdgeColor: viewTheme.edge.normal,
      enableEdgeEvents: false,
      renderEdgeLabels: false,
      hideEdgesOnMove: true,
      hideLabelsOnMove: true,
      labelRenderedSizeThreshold: 12,
      allowInvalidContainer: true,
    }),
    [viewTheme],
  );

  const handleHoveredNodeChange = useCallback((nodeId: string | null) => {
    setHoveredNode(nodeId);
  }, []);

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden rounded-xl"
      style={bgStyle}
    >
      <SigmaContainer
        graph={graph}
        settings={sigmaSettings}
        style={{ height: "100%", width: "100%", background: "transparent" }}
      >
        <GraphEventHandler
          onHoverNode={onHoverNode}
          onClickNode={onClickNode}
          onHoveredNodeChange={handleHoveredNodeChange}
        />
        <HoverReducer hoveredNode={hoveredNode} viewTheme={viewTheme} />
        <NodeDragHandler />
        <LinkDragHandler onLinkNodes={onLinkNodes} />
        <LayoutController settings={settings} />
        <ZoomControls />
      </SigmaContainer>

      <div className="absolute bottom-3 left-3 text-[11px] text-muted-foreground/40 pointer-events-none select-none">
        {graph.order} nodes &middot; {graph.size} edges &middot; Shift+drag to
        link
      </div>
    </div>
  );
}
