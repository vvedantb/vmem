"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { IconMoodEmpty, IconLoader2, IconPlus } from "@tabler/icons-react";
import { Button } from "@vmem/ui";
import AddMemoryModal from "@/components/AddMemoryModal";
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
  return isDark ? hslToHex(hue, 50, 72) : hslToHex(hue, 55, 48);
}

function idToJitter(id: string): { dx: number; dy: number } {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) + i;
  }
  return {
    dx: (h1 >>> 0) / 0xffffffff - 0.5,
    dy: (h2 >>> 0) / 0xffffffff - 0.5,
  };
}

const API_URL = clientEnv.NEXT_PUBLIC_API_URL;

interface GraphNode {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface RelationshipEdge {
  source: string;
  target: string;
  reason: string;
}

interface GraphResponse {
  nodes: GraphNode[];
  edges: RelationshipEdge[];
}

export default function MemoryGraph() {
  const { deleteMemory } = useMemoryContext();
  const { theme } = useThemeContext();
  const { getToken, userId } = useAuth();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [graphSettings, setGraphSettingsState] =
    useState<GraphSettings>(getGraphSettings);
  const [viewMode, setViewModeState] = useState<ViewMode>(getGraphViewMode);
  const [liveRelatesToEdges, setLiveRelatesToEdges] = useState<
    RelationshipEdge[]
  >([]);

  const currentNodesRef = useRef<SimNode[]>([]);
  const isFirstGraphRef = useRef(true);

  const graphQuery = useTanstackQuery({
    queryKey: ["graph"],
    queryFn: async (): Promise<GraphResponse> => {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_URL}/v1/graph`, { headers });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[graph] fetch failed ${res.status}:`, text);
        return { nodes: [], edges: [] };
      }
      return res.json() as Promise<GraphResponse>;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const graphData = graphQuery.data;

  const handleRelationshipEvent = useCallback(
    (event: {
      eventType: "relationship_created" | "relationship_deleted";
      source: string;
      target: string;
      reason?: string;
    }) => {
      if (event.eventType === "relationship_created") {
        setLiveRelatesToEdges((prev) => [
          ...prev,
          {
            source: event.source,
            target: event.target,
            reason: event.reason ?? "linked",
          },
        ]);
      } else {
        setLiveRelatesToEdges((prev) =>
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

  const isDark = theme === "dark";
  const viewTheme = useMemo(
    () => getViewTheme(viewMode, isDark),
    [viewMode, isDark],
  );

  const allRelatesToEdges = useMemo(() => {
    const apiEdges = graphData?.edges ?? [];
    return [...apiEdges, ...liveRelatesToEdges];
  }, [graphData?.edges, liveRelatesToEdges]);

  const graphNodes = graphData?.nodes ?? [];

  const { nodes, edges } = useMemo((): {
    nodes: SimNode[];
    edges: SimEdge[];
  } => {
    if (graphNodes.length === 0) return { nodes: [], edges: [] };

    const degreeCount = new Map<number, number>();
    const simEdges: SimEdge[] = [];

    const tagToIndices = new Map<string, number[]>();
    for (let i = 0; i < graphNodes.length; i++) {
      for (const tag of graphNodes[i].tags) {
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
    for (let i = 0; i < graphNodes.length; i++) {
      idToIndex.set(graphNodes[i].id, i);
    }

    for (const rel of allRelatesToEdges) {
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
    for (let i = 0; i < graphNodes.length; i++) {
      const primaryTag = graphNodes[i].tags[0];
      if (primaryTag) {
        const group = tagGroups.get(primaryTag);
        if (group) group.push(i);
        else tagGroups.set(primaryTag, [i]);
      }
    }

    const groupKeys = [...tagGroups.keys()];
    const ringRadius = 250;
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

    const simNodes: SimNode[] = graphNodes.map((m, i) => {
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
        const hash = idToJitter(m.id);
        const pos = primaryTag ? groupPositions.get(primaryTag) : undefined;
        if (pos) {
          const jitter = 60;
          x = pos.cx + hash.dx * jitter;
          y = pos.cy + hash.dy * jitter;
        } else {
          x = hash.dx * 80;
          y = hash.dy * 80;
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
        radius: Math.min(3 + degree * 0.6, 6),
        color: m.tags.length > 0 ? tagToColor(m.tags[0], false) : "#999999",
        opacity,
      };
    });

    return { nodes: simNodes, edges: simEdges };
  }, [graphNodes, allRelatesToEdges]);

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
      const gNode = graphNodes.find((m) => m.id === node.id);
      if (gNode && gNode.tags.length > 0) {
        node.color = tagToColor(gNode.tags[0], viewTheme.isDarkCanvas);
      } else {
        node.color = viewTheme.isDarkCanvas ? "#555566" : "#999999";
      }
    }
  }, [viewTheme, nodes, graphNodes]);

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
      await fetch(`${API_URL}/v1/relationships/link`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          memoryIdA: sourceId,
          memoryIdB: targetId,
          reason: "user linked",
        }),
      });
    },
    [getToken],
  );

  if (graphQuery.isLoading) {
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

        <div className="absolute top-3 right-12 z-10 flex items-center gap-1.5">
          <AddMemoryModal
            trigger={
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 bg-background/80 backdrop-blur-sm"
              >
                <IconPlus size={16} />
              </Button>
            }
          />
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
