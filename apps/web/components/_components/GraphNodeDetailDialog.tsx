"use client";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import type { SimNode, SimEdge } from "./graph-types";

interface GraphNodeDetailDialogProps {
  nodeId: string | null;
  nodes: SimNode[];
  edges: SimEdge[];
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function GraphNodeDetailDialog({
  nodeId,
  nodes,
  edges,
  onClose,
  onNavigate,
}: GraphNodeDetailDialogProps) {
  if (!nodeId) return null;

  const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex === -1) return null;

  const node = nodes[nodeIndex];

  const neighbors: Array<{ node: SimNode; weight: number }> = [];
  for (const edge of edges) {
    if (edge.sourceIndex === nodeIndex) {
      neighbors.push({
        node: nodes[edge.targetIndex],
        weight: edge.weight,
      });
    } else if (edge.targetIndex === nodeIndex) {
      neighbors.push({
        node: nodes[edge.sourceIndex],
        weight: edge.weight,
      });
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-foreground">{node.label}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_auto] gap-6 py-2">
          <div className="space-y-4 min-w-0">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Content
              </h4>
              <p className="text-foreground">{node.content}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Tags
              </h4>
              <div className="flex gap-2 flex-wrap">
                {node.tags.map((tag) => (
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
                {formatDate(node.createdAt)}
              </p>
            </div>
          </div>

          <div className="w-96 border-l border-border pl-6">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Related Memories
            </h4>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {neighbors.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No related memories found
                </p>
              )}
              {neighbors.map((neighbor) => (
                <Button
                  key={neighbor.node.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate(neighbor.node.id)}
                  className="w-full h-auto p-3 rounded-lg bg-muted/50 border border-border hover:bg-accent transition-colors justify-start items-start flex-col"
                >
                  <p className="text-sm font-medium text-foreground truncate w-full text-left">
                    {neighbor.node.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {neighbor.weight} shared tag
                    {neighbor.weight > 1 ? "s" : ""}
                  </p>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
