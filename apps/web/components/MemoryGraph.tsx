"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { IconMoodEmpty, IconLoader2 } from "@tabler/icons-react";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { clientEnv } from "@/env/client";
import type {
  SimNode,
  SimEdge,
  HoveredNodeInfo,
  GraphSettings,
} from "./_components/graph-types";
import type { ViewMode } from "./_components/graph-view-themes";
import { getViewTheme } from "./_components/graph-view-themes";
import GraphNodeTooltip from "./_components/GraphNodeTooltip";
import GraphNodeDetailDialog from "./_components/GraphNodeDetailDialog";
import GraphSettingsPopover from "./_components/GraphSettingsPopover";
import ViewModeSwitcher from "./_components/ViewModeSwitcher";
import ForceGraph from "./_components/ForceGraph";
import {
  getGraphSettings,
  setGraphSettings,
  getGraphViewMode,
  setGraphViewMode,
} from "@/lib/graph-cookies";

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

const API_URL = clientEnv.NEXT_PUBLIC_API_URL;

interface RelationshipEdge {
  source: string;
  target: string;
  reason: string;
}

export default function MemoryGraph() {
  const { memories, isLoading, deleteMemory } = useMemoryContext();
  const { theme } = useThemeContext();
  const { getToken } = useAuth();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [graphSettings, setGraphSettingsState] =
    useState<GraphSettings>(getGraphSettings);
  const [viewMode, setViewModeState] = useState<ViewMode>(getGraphViewMode);
  const [relatesToEdges, setRelatesToEdges] = useState<RelationshipEdge[]>([]);

  const currentNodesRef = useRef<SimNode[]>([]);
  const isFirstGraphRef = useRef(true);

  const handleRelationshipEvent = useCallback(
    (event: {
      eventType: "relationship_created" | "relationship_deleted";
      source: string;
      target: string;
      reason?: string;
    }) => {
      if (event.eventType === "relationship_created") {
        setRelatesToEdges((prev) => [
          ...prev,
          {
            source: event.source,
            target: event.target,
            reason: event.reason ?? "linked",
          },
        ]);
      } else {
        setRelatesToEdges((prev) =>
          prev.filter(
            (e) =>
              !(e.source === event.source && e.target === event.target) &&
              !(e.source === event.target && e.target === event.source),
          ),
        );
      }
    },
    [],
  );

  useMemoryEvents(handleRelationshipEvent);

  const handleSettingsChange = useCallback((next: GraphSettings) => {
    setGraphSettingsState(next);
    setGraphSettings(next);
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setGraphViewMode(mode);
  }, []);

  const fetchAllRelationships = useCallback(async () => {
    const token = await getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/v1/relationships/all`, { headers });
    if (res.ok) {
      const json: { data: RelationshipEdge[] } = await res.json();
      setRelatesToEdges(json.data);
    }
  }, [getToken]);

  useEffect(() => {
    if (memories.length === 0) return;
    fetchAllRelationships().catch(() => {});
  }, [memories.length, fetchAllRelationships]);

  const isDark = theme === "dark";
  const viewTheme = useMemo(
    () => getViewTheme(viewMode, isDark),
    [viewMode, isDark],
  );

  const { nodes, edges } = useMemo((): {
    nodes: SimNode[];
    edges: SimEdge[];
  } => {
    if (memories.length === 0) return { nodes: [], edges: [] };

    const degreeCount = new Map<number, number>();
    const simEdges: SimEdge[] = [];

    const tagToIndices = new Map<string, number[]>();
    for (let i = 0; i < memories.length; i++) {
      for (const tag of memories[i].tags) {
        const indices = tagToIndices.get(tag);
        if (indices) indices.push(i);
        else tagToIndices.set(tag, [i]);
      }
    }

    const edgeWeights = new Map<string, number>();
    for (const [, indices] of tagToIndices) {
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) {
          const lo = indices[a];
          const hi = indices[b];
          const key = `${lo}-${hi}`;
          edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
        }
      }
    }

    for (const [key, weight] of edgeWeights) {
      const dash = key.indexOf("-");
      const i = Number(key.slice(0, dash));
      const j = Number(key.slice(dash + 1));
      simEdges.push({
        sourceIndex: i,
        targetIndex: j,
        weight,
        edgeType: "tag",
      });
      degreeCount.set(i, (degreeCount.get(i) ?? 0) + 1);
      degreeCount.set(j, (degreeCount.get(j) ?? 0) + 1);
    }

    const idToIndex = new Map<string, number>();
    for (let i = 0; i < memories.length; i++) {
      idToIndex.set(memories[i].id, i);
    }

    for (const rel of relatesToEdges) {
      const si = idToIndex.get(rel.source);
      const ti = idToIndex.get(rel.target);
      if (si !== undefined && ti !== undefined) {
        simEdges.push({
          sourceIndex: si,
          targetIndex: ti,
          weight: 1,
          edgeType: "relates_to",
          reason: rel.reason,
        });
        degreeCount.set(si, (degreeCount.get(si) ?? 0) + 1);
        degreeCount.set(ti, (degreeCount.get(ti) ?? 0) + 1);
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

    const prevNodes = currentNodesRef.current;
    const prevById = new Map<string, SimNode>();
    for (const n of prevNodes) {
      prevById.set(n.id, n);
    }
    const isFirstRender = isFirstGraphRef.current;

    const simNodes: SimNode[] = memories.map((m, i) => {
      const degree = degreeCount.get(i) ?? 0;
      const primaryTag = m.tags[0];
      const prevNode = prevById.get(m.id);

      let x: number;
      let y: number;
      let vx = 0;
      let vy = 0;
      let opacity = 1;

      if (prevNode) {
        x = prevNode.x;
        y = prevNode.y;
        vx = prevNode.vx;
        vy = prevNode.vy;
        opacity = prevNode.opacity;
      } else {
        const pos = primaryTag ? groupPositions.get(primaryTag) : undefined;
        if (pos) {
          const jitter = 40;
          x = pos.cx + (Math.random() - 0.5) * jitter;
          y = pos.cy + (Math.random() - 0.5) * jitter;
        } else {
          x = (Math.random() - 0.5) * 80;
          y = (Math.random() - 0.5) * 80;
        }
        opacity = isFirstRender ? 1 : 0;
      }

      return {
        id: m.id,
        label: m.title,
        content: m.content,
        tags: m.tags,
        createdAt: m.createdAt,
        x,
        y,
        vx,
        vy,
        radius: Math.min(3.5 + degree * 1.5, 12),
        color: m.tags.length > 0 ? tagToColor(m.tags[0], false) : "#999999",
        opacity,
      };
    });

    return { nodes: simNodes, edges: simEdges };
  }, [memories, relatesToEdges]);

  useEffect(() => {
    currentNodesRef.current = nodes;
    if (nodes.length > 0) {
      isFirstGraphRef.current = false;
    }
  }, [nodes]);

  useEffect(() => {
    for (const node of nodes) {
      if (viewTheme.nodeColorOverride) {
        node.color = viewTheme.nodeColorOverride;
        continue;
      }
      const memory = memories.find((m) => m.id === node.id);
      if (memory && memory.tags.length > 0) {
        node.color = tagToColor(memory.tags[0], viewTheme.isDarkCanvas);
      } else {
        node.color = viewTheme.isDarkCanvas ? "#555566" : "#999999";
      }
    }
  }, [viewTheme, nodes, memories]);

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

  const handleLinkNodes = useCallback(
    async (sourceId: string, targetId: string) => {
      const token = await getToken();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_URL}/v1/relationships/link`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          memoryIdA: sourceId,
          memoryIdB: targetId,
          reason: "user linked",
        }),
      });
      if (res.ok) {
        await fetchAllRelationships();
      }
    },
    [getToken, fetchAllRelationships],
  );

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
          viewTheme={viewTheme}
          settings={graphSettings}
          onHoverNode={handleHoverNode}
          onClickNode={handleClickNode}
          onLinkNodes={handleLinkNodes}
        />

        <div className="absolute top-3 right-14 z-10">
          <GraphSettingsPopover
            settings={graphSettings}
            onChange={handleSettingsChange}
          />
        </div>

        <div className="absolute bottom-3 right-3 z-10">
          <ViewModeSwitcher
            activeMode={viewMode}
            onChange={handleViewModeChange}
          />
        </div>

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
