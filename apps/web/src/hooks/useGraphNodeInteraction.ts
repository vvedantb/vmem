"use client";

import { useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@vmem/backend";
import type { GraphNode, GraphEdge } from "@/lib/graph/types";
import type {
  HoveredEdgeInfo,
  HoveredNodeInfo,
  GraphDetailNode,
} from "@/lib/graph/graph-types";
import { getRelatedNodes } from "@/lib/graph/graph-data";

export function useGraphNodeInteraction(args: {
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  onFocusChange: (id: string | null) => void;
}) {
  const getNodeContent = useAction(api.graphApi.getNodeContent);
  const linkMemories = useAction(api.relationshipApi.linkMemories);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeInfo | null>(null);
  const [contentCache, setContentCache] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const inflightRef = useRef<Set<string>>(new Set());

  function ensureMemoryContent(nodeId: string) {
    if (contentCache.has(nodeId) || inflightRef.current.has(nodeId)) return;
    inflightRef.current.add(nodeId);
    void getNodeContent({ memoryId: nodeId })
      .then((content) => {
        setContentCache((prev) => {
          const next = new Map(prev);
          next.set(nodeId, content);
          return next;
        });
      })
      .finally(() => {
        inflightRef.current.delete(nodeId);
      });
  }

  const selectedNode =
    selectedNodeId === null
      ? null
      : (args.graphNodes.find((n) => n.id === selectedNodeId) ?? null);

  const selectedNodeData: GraphDetailNode | null =
    selectedNode === null
      ? null
      : {
          id: selectedNode.id,
          title: selectedNode.title,
          content:
            selectedNode.content !== undefined
              ? selectedNode.content
              : contentCache.get(selectedNode.id),
          tags: selectedNode.tags,
          createdAt: selectedNode.createdAt,
        };

  const relatedNodes =
    selectedNodeId === null
      ? []
      : getRelatedNodes(selectedNodeId, args.graphEdges, args.graphNodes);

  function handleClickNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setHoveredNode(null);
    const node = args.graphNodes.find((n) => n.id === nodeId);
    if (node && node.kind === "memory" && node.content === undefined) {
      ensureMemoryContent(nodeId);
    }
  }

  function handleFocusNode(nodeId: string) {
    // only memory nodes have a neo4j neighbourhood
    const node = args.graphNodes.find((n) => n.id === nodeId);
    if (!node || node.kind !== "memory") return;
    args.onFocusChange(nodeId);
    setSelectedNodeId(null);
  }

  return {
    selectedNodeId,
    hoveredNode,
    hoveredEdge,
    selectedNodeData,
    relatedNodes,
    setHoveredNode,
    setHoveredEdge,
    handleClickNode,
    handleCloseDetail: () => setSelectedNodeId(null),
    handleNavigateNode: (nodeId: string) => setSelectedNodeId(nodeId),
    handleFocusNode,
    handleBackToGlobal: () => args.onFocusChange(null),
    handleLinkNodes: async (sourceId: string, targetId: string) => {
      await linkMemories({
        memoryIdA: sourceId,
        memoryIdB: targetId,
        reason: "user linked",
      });
    },
  };
}
