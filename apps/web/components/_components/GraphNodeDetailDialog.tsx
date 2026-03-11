"use client";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import type Graph from "graphology";
import type { NodeAttributes, EdgeAttributes } from "./graph-types";

interface GraphNodeDetailDialogProps {
  nodeId: string | null;
  graph: Graph<NodeAttributes, EdgeAttributes> | null;
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
  graph,
  onClose,
  onNavigate,
}: GraphNodeDetailDialogProps) {
  if (!nodeId || !graph || !graph.hasNode(nodeId)) return null;

  const attrs = graph.getNodeAttributes(nodeId);
  const neighbors = graph.neighbors(nodeId);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-foreground">{attrs.label}</DialogTitle>
          <DialogDescription className="sr-only">
            Memory node details including content, tags, and related memories
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Content
            </h4>
            <p className="text-foreground">{attrs.content}</p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Tags
            </h4>
            <div className="flex gap-2 flex-wrap">
              {attrs.tags.map((tag) => (
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
              {formatDate(attrs.createdAt)}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Related Memories
            </h4>
            <div className="space-y-2">
              {neighbors.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No related memories found
                </p>
              )}
              {neighbors.map((neighborId) => {
                const neighborAttrs = graph.getNodeAttributes(neighborId);
                const edgeKey =
                  graph.edge(nodeId, neighborId) ??
                  graph.edge(neighborId, nodeId);
                const weight = edgeKey
                  ? graph.getEdgeAttribute(edgeKey, "weight")
                  : 0;
                return (
                  <Button
                    key={neighborId}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate(neighborId)}
                    className="w-full h-auto p-3 rounded-lg bg-muted/50 border border-border hover:bg-accent transition-colors justify-start items-start flex-col"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {neighborAttrs.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {weight} shared tag{weight > 1 ? "s" : ""}
                    </p>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
