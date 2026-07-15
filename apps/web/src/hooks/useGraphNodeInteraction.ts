import { useCallback, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@vmem/backend";
import type { GraphNode, GraphEdge, RelatedNode } from "@/lib/graph/types";
import type {
  HoveredEdgeInfo,
  HoveredNodeInfo,
  GraphDetailNode,
} from "@/lib/graph/graph-types";
import { getRelatedNodes } from "@/lib/graph/graph-data";

export type GraphNodeInteractionState = {
  selectedNodeId: string | null;
  hoveredNode: HoveredNodeInfo | null;
  hoveredEdge: HoveredEdgeInfo | null;
  selectedNodeData: GraphDetailNode | null;
  relatedNodes: RelatedNode[];
};

export type GraphNodeInteractionActions = {
  setHoveredNode: (node: HoveredNodeInfo | null) => void;
  setHoveredEdge: (edge: HoveredEdgeInfo | null) => void;
  handleClickNode: (nodeId: string) => void;
  handleCloseDetail: () => void;
  handleNavigateNode: (nodeId: string) => void;
  handleFocusNode: (nodeId: string) => void;
  handleBackToGlobal: () => void;
  handleLinkNodes: (sourceId: string, targetId: string) => Promise<void>;
};

export type GraphNodeInteraction = GraphNodeInteractionState &
  GraphNodeInteractionActions;

export function useGraphNodeInteraction(args: {
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  onFocusChange: (id: string | null) => void;
}): GraphNodeInteraction {
  const getNodeContent = useAction(api.graphApi.getNodeContent);
  const linkMemories = useAction(api.relationshipApi.linkMemories);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeInfo | null>(null);
  const [contentCache, setContentCache] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const inflightRef = useRef<Set<string>>(new Set());
  const onFocusChangeRef = useRef(args.onFocusChange);
  onFocusChangeRef.current = args.onFocusChange;

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of args.graphNodes) map.set(node.id, node);
    return map;
  }, [args.graphNodes]);

  const ensureMemoryContent = useCallback(
    (nodeId: string) => {
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
    },
    [contentCache, getNodeContent],
  );

  const selectedNode =
    selectedNodeId === null ? null : (nodeById.get(selectedNodeId) ?? null);

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

  const handleClickNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setHoveredNode(null);
      const node = nodeById.get(nodeId);
      if (node && node.kind === "memory" && node.content === undefined) {
        ensureMemoryContent(nodeId);
      }
    },
    [ensureMemoryContent, nodeById],
  );

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      const node = nodeById.get(nodeId);
      if (!node || node.kind !== "memory") return;
      onFocusChangeRef.current(nodeId);
      setSelectedNodeId(null);
    },
    [nodeById],
  );

  const handleCloseDetail = useCallback(() => setSelectedNodeId(null), []);
  const handleNavigateNode = useCallback(
    (nodeId: string) => setSelectedNodeId(nodeId),
    [],
  );
  const handleBackToGlobal = useCallback(
    () => onFocusChangeRef.current(null),
    [],
  );
  const handleLinkNodes = useCallback(
    async (sourceId: string, targetId: string) => {
      await linkMemories({
        memoryIdA: sourceId,
        memoryIdB: targetId,
        reason: "user linked",
      });
    },
    [linkMemories],
  );

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
    handleLinkNodes,
  };
}
