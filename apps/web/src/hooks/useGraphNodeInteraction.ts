import { useState } from "react";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import type { GraphNode, GraphEdge, RelatedNode } from "@/lib/graph/types";
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

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeInfo | null>(null);

  const nodeById = new Map<string, GraphNode>();
  for (const node of args.graphNodes) nodeById.set(node.id, node);

  const selectedNode =
    selectedNodeId === null ? null : (nodeById.get(selectedNodeId) ?? null);

  const selectedContentQuery = useQuery({
    queryKey: ["graph-node-content", selectedNodeId],
    queryFn: async () => {
      if (selectedNodeId === null) return "";
      return await getNodeContent({ memoryId: selectedNodeId });
    },
    enabled:
      selectedNode !== null &&
      selectedNode.kind === "memory" &&
      selectedNode.content === undefined,
    staleTime: 5 * 60_000,
  });

  const selectedNodeData: GraphDetailNode | null =
    selectedNode === null
      ? null
      : {
          id: selectedNode.id,
          title: selectedNode.title,
          content:
            selectedNode.content !== undefined
              ? selectedNode.content
              : selectedContentQuery.data,
          tags: selectedNode.tags,
          createdAt: selectedNode.createdAt,
        };

  const relatedNodes: RelatedNode[] =
    selectedNodeId === null
      ? []
      : getRelatedNodes(selectedNodeId, args.graphEdges, nodeById);

  function handleClickNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setHoveredNode(null);
  }

  function handleFocusNode(nodeId: string) {
    const node = nodeById.get(nodeId);
    if (!node || node.kind !== "memory") return;
    args.onFocusChange(nodeId);
    setSelectedNodeId(null);
  }

  function handleCloseDetail() {
    setSelectedNodeId(null);
  }

  function handleNavigateNode(nodeId: string) {
    setSelectedNodeId(nodeId);
  }

  function handleBackToGlobal() {
    args.onFocusChange(null);
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
    handleCloseDetail,
    handleNavigateNode,
    handleFocusNode,
    handleBackToGlobal,
  };
}
