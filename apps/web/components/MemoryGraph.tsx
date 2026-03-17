"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { IconMoodEmpty, IconLoader2 } from "@tabler/icons-react";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import type {
  SimNode,
  SimEdge,
  HoveredNodeInfo,
} from "./_components/graph-types";
import GraphNodeTooltip from "./_components/GraphNodeTooltip";
import GraphNodeDetailDialog from "./_components/GraphNodeDetailDialog";
import ForceGraph from "./_components/ForceGraph";

function tagToHue(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

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

function tagToColor(tag: string, isDark: boolean): string {
  const hue = tagToHue(tag);
  return isDark ? hslToHex(hue, 65, 65) : hslToHex(hue, 55, 48);
}

export default function MemoryGraph() {
  const { memories, isLoading, deleteMemory } = useMemoryContext();
  const { theme } = useThemeContext();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);

  const isDark = theme === "dark";

  const { nodes, edges } = useMemo((): {
    nodes: SimNode[];
    edges: SimEdge[];
  } => {
    if (memories.length === 0) return { nodes: [], edges: [] };

    const degreeCount = new Map<number, number>();
    const simEdges: SimEdge[] = [];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const shared = memories[i].tags.filter((t) =>
          memories[j].tags.includes(t),
        );
        if (shared.length > 0) {
          simEdges.push({
            sourceIndex: i,
            targetIndex: j,
            weight: shared.length,
          });
          degreeCount.set(i, (degreeCount.get(i) ?? 0) + 1);
          degreeCount.set(j, (degreeCount.get(j) ?? 0) + 1);
        }
      }
    }

    const tagGroups = new Map<string, number[]>();
    for (let i = 0; i < memories.length; i++) {
      const primaryTag = memories[i].tags[0];
      if (primaryTag) {
        const group = tagGroups.get(primaryTag);
        if (group) group.push(i);
        else tagGroups.set(primaryTag, [i]);
      }
    }

    const groupKeys = [...tagGroups.keys()];
    const ringRadius = 150;
    const groupPositions = new Map<string, { cx: number; cy: number }>();
    for (let g = 0; g < groupKeys.length; g++) {
      const angle = (g / groupKeys.length) * Math.PI * 2;
      groupPositions.set(groupKeys[g], {
        cx: Math.cos(angle) * ringRadius,
        cy: Math.sin(angle) * ringRadius,
      });
    }

    const simNodes: SimNode[] = memories.map((m, i) => {
      const degree = degreeCount.get(i) ?? 0;
      const primaryTag = m.tags[0];
      let x: number;
      let y: number;

      const pos = primaryTag ? groupPositions.get(primaryTag) : undefined;
      if (pos) {
        const jitter = 40;
        x = pos.cx + (Math.random() - 0.5) * jitter;
        y = pos.cy + (Math.random() - 0.5) * jitter;
      } else {
        x = (Math.random() - 0.5) * 80;
        y = (Math.random() - 0.5) * 80;
      }

      return {
        id: m.id,
        label: m.title,
        content: m.content,
        tags: m.tags,
        createdAt: m.createdAt,
        x,
        y,
        vx: 0,
        vy: 0,
        radius: 3.5 + degree * 1.5,
        color: m.tags.length > 0 ? tagToColor(m.tags[0], false) : "#999999",
      };
    });

    return { nodes: simNodes, edges: simEdges };
  }, [memories]);

  useEffect(() => {
    for (const node of nodes) {
      const memory = memories.find((m) => m.id === node.id);
      if (memory && memory.tags.length > 0) {
        node.color = tagToColor(memory.tags[0], isDark);
      } else {
        node.color = isDark ? "#555566" : "#999999";
      }
    }
  }, [isDark, nodes, memories]);

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
      <div className="flex h-full min-h-0 items-center justify-center">
        <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (nodes.length === 0) {
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
        <ForceGraph
          nodes={nodes}
          edges={edges}
          isDark={isDark}
          onHoverNode={handleHoverNode}
          onClickNode={handleClickNode}
        />

        {hoveredNode && !selectedNodeId && (
          <GraphNodeTooltip
            title={hoveredNode.title}
            content={hoveredNode.content}
          />
        )}
      </div>

      <GraphNodeDetailDialog
        nodeId={selectedNodeId}
        nodes={nodes}
        edges={edges}
        onClose={handleCloseDialog}
        onNavigate={handleNavigateNode}
        onDelete={deleteMemory}
      />
    </>
  );
}
