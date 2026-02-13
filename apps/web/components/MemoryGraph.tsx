"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Skeleton,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import {
  IconAlertCircle,
  IconMoodEmpty,
  IconZoomIn,
  IconZoomOut,
  IconFocus2,
} from "@tabler/icons-react";
import { useThemeContext } from "./contexts/ThemeContext";

interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface GraphNode {
  id: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tags: string[];
  content: string;
  createdAt: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export default function MemoryGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const { theme } = useThemeContext();
  const animationRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  useEffect(() => {
    const fetchAndBuildGraph = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/memories");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch memories");
        }

        const memories: Memory[] = data.data;
        const graph = buildGraphData(
          memories,
          dimensions.width,
          dimensions.height,
        );
        setGraphData(graph);
        nodesRef.current = graph.nodes;
        edgesRef.current = graph.edges;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch memories",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndBuildGraph();
  }, [dimensions.width, dimensions.height]);

  const buildGraphData = (
    memories: Memory[],
    width: number,
    height: number,
  ): GraphData => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    const nodes: GraphNode[] = memories.map((memory, index) => {
      const angle = (index / memories.length) * Math.PI * 2;
      return {
        id: memory.id,
        title: memory.title,
        x: centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        tags: memory.tags,
        content: memory.content,
        createdAt: memory.createdAt,
      };
    });

    const edges: GraphEdge[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const sharedTags = nodes[i].tags.filter((tag) =>
          nodes[j].tags.includes(tag),
        );
        if (sharedTags.length > 0) {
          edges.push({
            source: nodes[i].id,
            target: nodes[j].id,
            weight: sharedTags.length,
          });
        }
      }
    }

    return { nodes, edges };
  };

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width,
          height: Math.max(rect.height, 500),
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) return;

    const simulate = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;

      for (const node of nodes) {
        node.vx += (centerX - node.x) * 0.001;
        node.vy += (centerY - node.y) * 0.001;

        for (const other of nodes) {
          if (node.id === other.id) continue;
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 1000 / (dist * dist);
          node.vx += (dx / dist) * force;
          node.vy += (dy / dist) * force;
        }
      }

      for (const edge of edges) {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 150) * 0.01 * edge.weight;

        source.vx += (dx / dist) * force;
        source.vy += (dy / dist) * force;
        target.vx -= (dx / dist) * force;
        target.vy -= (dy / dist) * force;
      }

      for (const node of nodes) {
        node.vx *= 0.9;
        node.vy *= 0.9;
        node.x += node.vx;
        node.y += node.vy;

        const padding = 50;
        node.x = Math.max(
          padding,
          Math.min(dimensions.width - padding, node.x),
        );
        node.y = Math.max(
          padding,
          Math.min(dimensions.height - padding, node.y),
        );
      }

      animationRef.current = requestAnimationFrame(simulate);
    };

    animationRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [graphData, dimensions]);

  useEffect(() => {
    if (!canvasRef.current || !graphData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const isDark = theme === "dark";

      ctx.fillStyle = isDark ? "#0a0a0a" : "#fafafa";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      ctx.strokeStyle = isDark
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.1)";
      ctx.lineWidth = 1 / zoom;

      for (const edge of edges) {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target) continue;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }

      for (const node of nodes) {
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNode?.id === node.id;
        const radius = isHovered || isSelected ? 24 : 20;

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius / zoom, 0, Math.PI * 2);

        if (isSelected) {
          ctx.fillStyle = isDark ? "#ffffff" : "#000000";
        } else if (isHovered) {
          ctx.fillStyle = isDark ? "#a3a3a3" : "#404040";
        } else {
          ctx.fillStyle = isDark ? "#404040" : "#e5e5e5";
        }
        ctx.fill();

        ctx.strokeStyle = isDark
          ? "rgba(255, 255, 255, 0.2)"
          : "rgba(0, 0, 0, 0.2)";
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();

        ctx.font = `${12 / zoom}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isDark ? "#f5f5f5" : "#0a0a0a";

        const maxWidth = 100 / zoom;
        let title = node.title;
        if (ctx.measureText(title).width > maxWidth) {
          while (
            ctx.measureText(title + "...").width > maxWidth &&
            title.length > 0
          ) {
            title = title.slice(0, -1);
          }
          title += "...";
        }
        ctx.fillText(title, node.x, node.y + (radius + 8) / zoom);
      }

      ctx.restore();
      requestAnimationFrame(render);
    };

    const frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [graphData, theme, zoom, pan, hoveredNode, selectedNode]);

  const getMousePos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom],
  );

  const findNodeAtPosition = useCallback(
    (x: number, y: number): GraphNode | null => {
      const nodes = nodesRef.current;
      for (const node of nodes) {
        const dx = node.x - x;
        const dy = node.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 25) {
          return node;
        }
      }
      return null;
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging) {
        setPan({
          x: pan.x + e.movementX,
          y: pan.y + e.movementY,
        });
        return;
      }

      const pos = getMousePos(e);
      const node = findNodeAtPosition(pos.x, pos.y);
      setHoveredNode(node);

      if (canvasRef.current) {
        canvasRef.current.style.cursor = node ? "pointer" : "grab";
      }
    },
    [isDragging, getMousePos, findNodeAtPosition, pan],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getMousePos(e);
      const node = findNodeAtPosition(pos.x, pos.y);

      if (node) {
        setSelectedNode(node);
      } else {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        if (canvasRef.current) {
          canvasRef.current.style.cursor = "grabbing";
        }
      }
    },
    [getMousePos, findNodeAtPosition, pan],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hoveredNode ? "pointer" : "grab";
    }
  }, [hoveredNode]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.5, Math.min(3, z * delta)));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-[500px] w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
          <IconAlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
          Failed to load graph
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm font-medium bg-black dark:bg-white text-white dark:text-black rounded-lg hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-neutral-400 dark:text-neutral-500" />
        </div>
        <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
          No memories to visualize
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Add some memories to see them in the graph
        </p>
      </div>
    );
  }

  const connectionCount = graphData.edges.length;
  const nodeCount = graphData.nodes.length;

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex gap-4 text-sm text-neutral-500 dark:text-neutral-400">
            <span>{nodeCount} memories</span>
            <span>{connectionCount} connections</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
              className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10"
            >
              <IconZoomIn size={16} />
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => setZoom((z) => Math.max(0.5, z * 0.8))}
              className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10"
            >
              <IconZoomOut size={16} />
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={resetView}
              className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10"
            >
              <IconFocus2 size={16} />
            </Button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative border border-black/10 dark:border-white/10 rounded-xl overflow-hidden"
          style={{ height: "500px" }}
        >
          <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{ cursor: "grab" }}
          />

          {hoveredNode && !selectedNode && (
            <div className="absolute top-4 left-4 bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-lg p-3 shadow-lg max-w-xs">
              <p className="font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                {hoveredNode.title}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
                {hoveredNode.content}
              </p>
            </div>
          )}

          <div className="absolute bottom-4 left-4 text-xs text-neutral-400 dark:text-neutral-600">
            Click node to view details &bull; Drag to pan &bull; Scroll to zoom
          </div>
        </div>
      </div>

      <Dialog
        open={!!selectedNode}
        onOpenChange={(open) => {
          if (!open) setSelectedNode(null);
        }}
      >
        <DialogContent className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10">
          {selectedNode && (
            <>
              <DialogHeader className="border-b border-black/10 dark:border-white/10 pb-4">
                <DialogTitle className="text-neutral-800 dark:text-neutral-200">
                  {selectedNode.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                    Content
                  </h4>
                  <p className="text-neutral-800 dark:text-neutral-200">
                    {selectedNode.content}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                    Tags
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {selectedNode.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-400 text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                    Created
                  </h4>
                  <p className="text-neutral-600 dark:text-neutral-400">
                    {formatDate(selectedNode.createdAt)}
                  </p>
                </div>

                {graphData && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                      Related Memories
                    </h4>
                    <div className="space-y-2">
                      {graphData.edges
                        .filter(
                          (e) =>
                            e.source === selectedNode.id ||
                            e.target === selectedNode.id,
                        )
                        .map((edge) => {
                          const relatedId =
                            edge.source === selectedNode.id
                              ? edge.target
                              : edge.source;
                          const relatedNode = graphData.nodes.find(
                            (n) => n.id === relatedId,
                          );
                          if (!relatedNode) return null;
                          return (
                            <button
                              key={relatedId}
                              onClick={() => setSelectedNode(relatedNode)}
                              className="w-full text-left p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                            >
                              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                                {relatedNode.title}
                              </p>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                {edge.weight} shared tag
                                {edge.weight > 1 ? "s" : ""}
                              </p>
                            </button>
                          );
                        })}
                      {graphData.edges.filter(
                        (e) =>
                          e.source === selectedNode.id ||
                          e.target === selectedNode.id,
                      ).length === 0 && (
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          No related memories found
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
