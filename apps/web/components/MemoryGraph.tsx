"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { Skeleton } from "@vmem/ui";
import { IconMoodEmpty } from "@tabler/icons-react";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import type {
  NodeAttributes,
  EdgeAttributes,
  HoveredNodeInfo,
  GraphThemeColors,
} from "./_components/graph-types";
import GraphNodeTooltip from "./_components/GraphNodeTooltip";
import GraphNodeDetailDialog from "./_components/GraphNodeDetailDialog";

const GraphRenderer = dynamic(() => import("./_components/GraphRenderer"), {
  ssr: false,
});

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function tagToHue(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

function tagToHex(tag: string, isDark: boolean): string {
  const hue = tagToHue(tag);
  return isDark ? hslToHex(hue, 60, 65) : hslToHex(hue, 55, 50);
}

export default function MemoryGraph() {
  const { memories, isLoading } = useMemoryContext();
  const { theme } = useThemeContext();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);

  const isDark = theme === "dark";

  const themeColors = useMemo<GraphThemeColors>(
    () =>
      isDark
        ? {
            labelColor: "#e8e8ec",
            edgeColor: "#ffffff22",
            defaultNodeColor: "#888888",
          }
        : {
            labelColor: "#333338",
            edgeColor: "#00000018",
            defaultNodeColor: "#888888",
          },
    [isDark],
  );

  const { graph, nodeCount, edgeCount } = useMemo(() => {
    if (memories.length === 0) {
      return { graph: null, nodeCount: 0, edgeCount: 0 };
    }

    const g = new Graph<NodeAttributes, EdgeAttributes>({
      type: "undirected",
    });

    const edgeColor = isDark ? "#ffffff18" : "#00000014";

    for (const memory of memories) {
      const color =
        memory.tags.length > 0 ? tagToHex(memory.tags[0], isDark) : "#888888";
      g.addNode(memory.id, {
        label: memory.title,
        content: memory.content,
        tags: memory.tags,
        createdAt: memory.createdAt,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 5,
        color,
      });
    }

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const sharedTags = memories[i].tags.filter((tag) =>
          memories[j].tags.includes(tag),
        );
        if (sharedTags.length > 0) {
          g.addEdge(memories[i].id, memories[j].id, {
            weight: sharedTags.length,
            color: edgeColor,
          });
        }
      }
    }

    g.forEachNode((node) => {
      const degree = g.degree(node);
      g.setNodeAttribute(node, "size", 5 + degree * 2);
    });

    if (g.order > 1) {
      forceAtlas2.assign(g, {
        iterations: 50,
        settings: {
          gravity: 1,
          barnesHutOptimize: g.order > 100,
          scalingRatio: 2,
        },
      });
    }

    return { graph: g, nodeCount: g.order, edgeCount: g.size };
  }, [memories, isDark]);

  const handleHoverNode = useCallback((info: HoveredNodeInfo | null) => {
    setHoveredNode(info);
  }, []);

  const handleClickNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setHoveredNode(null);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNavigateNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex flex-shrink-0 justify-between items-center">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>
        <Skeleton className="flex-1 min-h-0 w-full rounded-xl" />
      </div>
    );
  }

  if (!graph || nodeCount === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          No memories to visualize
        </h3>
        <p className="text-sm text-muted-foreground">
          Add some memories to see them in the graph
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="relative h-full min-h-0">
        <GraphRenderer
          graph={graph}
          onHoverNode={handleHoverNode}
          onClickNode={handleClickNode}
          themeColors={themeColors}
          nodeCount={nodeCount}
          connectionCount={edgeCount}
        />

        {hoveredNode && !selectedNodeId && (
          <GraphNodeTooltip
            title={hoveredNode.title}
            content={hoveredNode.content}
            x={hoveredNode.viewportX}
            y={hoveredNode.viewportY}
          />
        )}
      </div>

      <GraphNodeDetailDialog
        nodeId={selectedNodeId}
        graph={graph}
        onClose={handleCloseDialog}
        onNavigate={handleNavigateNode}
      />
    </>
  );
}
