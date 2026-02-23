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
  IconMoodEmpty,
  IconZoomIn,
  IconZoomOut,
  IconFocus2,
} from "@tabler/icons-react";
import { useThemeContext } from "./contexts/ThemeContext";
import { type Memory } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";

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
  const { memories, isLoading } = useMemoryContext();
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const { theme } = useThemeContext();
  const animationRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  useEffect(() => {
    if (isLoading) return;

    const graph = buildGraphData(memories, dimensions.width, dimensions.height);
    setGraphData(graph);
    nodesRef.current = graph.nodes;
    edgesRef.current = graph.edges;
  }, [memories, isLoading, dimensions.width, dimensions.height]);

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
          height: Math.max(rect.height, 384),
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
      const rootStyles = getComputedStyle(document.documentElement);
      const readColor = (token: string, alpha?: number) => {
        const fallbackValue =
          rootStyles.getPropertyValue("--foreground").trim() || "0 0 0";
        const value =
          rootStyles.getPropertyValue(`--${token}`).trim() || fallbackValue;
        return alpha === undefined
          ? `oklch(${value})`
          : `oklch(${value} / ${alpha})`;
      };
      const colors = {
        background: readColor("background"),
        edge: readColor("border", 0.65),
        nodeDefault: readColor("muted-foreground", 0.45),
        nodeHover: readColor("foreground", 0.7),
        nodeSelected: readColor("primary"),
        nodeStroke: readColor("border", 0.9),
        label: readColor("foreground"),
      };

      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      ctx.strokeStyle = colors.edge;
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
          ctx.fillStyle = colors.nodeSelected;
        } else if (isHovered) {
          ctx.fillStyle = colors.nodeHover;
        } else {
          ctx.fillStyle = colors.nodeDefault;
        }
        ctx.fill();

        ctx.strokeStyle = colors.nodeStroke;
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();

        ctx.font = `${12 / zoom}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = colors.label;

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
        if (canvasRef.current) {
          canvasRef.current.style.cursor = "grabbing";
        }
      }
    },
    [getMousePos, findNodeAtPosition],
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
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
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

  const connectionCount = graphData.edges.length;
  const nodeCount = graphData.nodes.length;

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{nodeCount} memories</span>
            <span>{connectionCount} connections</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
              className="bg-muted border border-border"
            >
              <IconZoomIn size={16} />
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => setZoom((z) => Math.max(0.5, z * 0.8))}
              className="bg-muted border border-border"
            >
              <IconZoomOut size={16} />
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={resetView}
              className="bg-muted border border-border"
            >
              <IconFocus2 size={16} />
            </Button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative h-96 overflow-hidden rounded-xl border border-border"
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
            <div className="absolute top-4 left-4 glass-panel rounded-lg p-3 max-w-xs">
              <p className="font-medium text-foreground mb-1">
                {hoveredNode.title}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {hoveredNode.content}
              </p>
            </div>
          )}

          <div className="absolute bottom-4 left-4 text-xs text-muted-foreground">
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
        <DialogContent>
          {selectedNode && (
            <>
              <DialogHeader className="border-b border-border pb-4">
                <DialogTitle className="text-foreground">
                  {selectedNode.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Content
                  </h4>
                  <p className="text-foreground">{selectedNode.content}</p>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Tags
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {selectedNode.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="bg-muted border-border text-muted-foreground text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Created
                  </h4>
                  <p className="text-muted-foreground">
                    {formatDate(selectedNode.createdAt)}
                  </p>
                </div>

                {graphData && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
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
                            <Button
                              key={relatedId}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedNode(relatedNode)}
                              className="w-full h-auto p-3 rounded-lg bg-muted/50 border border-border hover:bg-accent transition-colors justify-start items-start flex-col"
                            >
                              <p className="text-sm font-medium text-foreground">
                                {relatedNode.title}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {edge.weight} shared tag
                                {edge.weight > 1 ? "s" : ""}
                              </p>
                            </Button>
                          );
                        })}
                      {graphData.edges.filter(
                        (e) =>
                          e.source === selectedNode.id ||
                          e.target === selectedNode.id,
                      ).length === 0 && (
                        <p className="text-sm text-muted-foreground">
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
