"use client";

import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { IconMoodEmpty, IconLoader2, IconPlus } from "@tabler/icons-react";
import { Button } from "@vmem/ui";
import { z } from "zod";
import AddMemoryModal from "@/components/AddMemoryModal";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { clientEnv } from "@/env/client";
import type { HoveredNodeInfo, GraphSettings } from "./_components/graph-types";
import type { ViewMode } from "./_components/graph-view-themes";
import { getViewTheme } from "./_components/graph-view-themes";
import GraphNodeTooltip from "./_components/GraphNodeTooltip";
import GraphNodeDetailDialog from "./_components/GraphNodeDetailDialog";
import GraphSettingsPopover from "./_components/GraphSettingsPopover";
import ViewModeSwitcher from "./_components/ViewModeSwitcher";
import GraphCanvas from "./_components/GraphCanvas";
import type {
  GraphNode,
  GraphEdge,
  RelatedNode,
} from "./_components/canvas/types";
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

const API_URL = clientEnv.NEXT_PUBLIC_API_URL;

const graphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
});

const relationshipEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  reason: z.string(),
});

const graphResponseSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(relationshipEdgeSchema),
});

type RelationshipEdge = z.infer<typeof relationshipEdgeSchema>;
type GraphResponse = z.infer<typeof graphResponseSchema>;

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
        throw new Error(text || `Graph request failed with ${res.status}`);
      }
      return graphResponseSchema.parse(await res.json());
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

  const apiNodes = graphData?.nodes ?? [];

  const { graphNodes, graphEdges } = useMemo(() => {
    if (apiNodes.length === 0)
      return { graphNodes: [] as GraphNode[], graphEdges: [] as GraphEdge[] };

    const tagToNodeIds = new Map<string, string[]>();
    for (const node of apiNodes) {
      for (const tag of node.tags) {
        const ids = tagToNodeIds.get(tag);
        if (ids) ids.push(node.id);
        else tagToNodeIds.set(tag, [node.id]);
      }
    }

    const edgeWeights = new Map<string, number>();
    for (const [, ids] of tagToNodeIds) {
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const key =
            ids[a] < ids[b] ? `${ids[a]}|${ids[b]}` : `${ids[b]}|${ids[a]}`;
          edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
        }
      }
    }

    const degreeCount = new Map<string, number>();
    for (const [key] of edgeWeights) {
      const [a, b] = key.split("|");
      degreeCount.set(a, (degreeCount.get(a) ?? 0) + 1);
      degreeCount.set(b, (degreeCount.get(b) ?? 0) + 1);
    }
    for (const rel of allRelatesToEdges) {
      degreeCount.set(rel.source, (degreeCount.get(rel.source) ?? 0) + 1);
      degreeCount.set(rel.target, (degreeCount.get(rel.target) ?? 0) + 1);
    }

    const nodeSet = new Set(apiNodes.map((n) => n.id));

    const gNodes: GraphNode[] = apiNodes.map((node) => {
      const degree = degreeCount.get(node.id) ?? 0;
      return {
        id: node.id,
        title: node.title,
        content: node.content,
        tags: node.tags,
        createdAt: node.createdAt,
        color: viewTheme.nodeColorOverride
          ? viewTheme.nodeColorOverride
          : node.tags.length > 0
            ? tagToColor(node.tags[0], viewTheme.isDarkCanvas)
            : viewTheme.isDarkCanvas
              ? "#555566"
              : "#999999",
        size: Math.min(3 + degree * 0.6, 6),
      };
    });

    const gEdges: GraphEdge[] = [];
    const addedPairs = new Set<string>();

    for (const [key, weight] of edgeWeights) {
      const [a, b] = key.split("|");
      if (nodeSet.has(a) && nodeSet.has(b)) {
        gEdges.push({ source: a, target: b, weight, edgeType: "tag" });
        addedPairs.add(key);
      }
    }

    for (const rel of allRelatesToEdges) {
      if (nodeSet.has(rel.source) && nodeSet.has(rel.target)) {
        const pairKey =
          rel.source < rel.target
            ? `${rel.source}|${rel.target}`
            : `${rel.target}|${rel.source}`;
        if (!addedPairs.has(pairKey)) {
          gEdges.push({
            source: rel.source,
            target: rel.target,
            weight: 1,
            edgeType: "relates_to",
            reason: rel.reason,
          });
          addedPairs.add(pairKey);
        }
      }
    }

    return { graphNodes: gNodes, graphEdges: gEdges };
  }, [apiNodes, allRelatesToEdges, viewTheme]);

  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = graphNodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;
    return {
      id: node.id,
      title: node.title,
      content: node.content,
      tags: node.tags,
      createdAt: node.createdAt,
    };
  }, [selectedNodeId, graphNodes]);

  const relatedNodes = useMemo((): RelatedNode[] => {
    if (!selectedNodeId) return [];
    const related = new Map<string, number>();
    for (const edge of graphEdges) {
      const sId =
        typeof edge.source === "string" ? edge.source : edge.source.id;
      const tId =
        typeof edge.target === "string" ? edge.target : edge.target.id;
      if (sId === selectedNodeId) {
        related.set(tId, (related.get(tId) ?? 0) + edge.weight);
      } else if (tId === selectedNodeId) {
        related.set(sId, (related.get(sId) ?? 0) + edge.weight);
      }
    }
    return Array.from(related.entries()).map(([id, weight]) => {
      const node = graphNodes.find((n) => n.id === id);
      return { id, title: node?.title ?? id, weight };
    });
  }, [selectedNodeId, graphEdges, graphNodes]);

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

  if (graphQuery.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          Failed to load graph
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {graphQuery.error.message}
        </p>
      </div>
    );
  }

  if (graphNodes.length === 0) {
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
        <GraphCanvas
          nodes={graphNodes}
          edges={graphEdges}
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
        nodeData={selectedNodeData}
        relatedNodes={relatedNodes}
        onClose={handleCloseDialog}
        onNavigate={handleNavigateNode}
        onDelete={deleteMemory}
      />
    </>
  );
}
