"use client";

import { useState } from "react";
import { IconTrash, IconLoader2 } from "@tabler/icons-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import type Graph from "graphology";
import type { NodeAttributes, EdgeAttributes } from "./graph-types";

interface GraphNodeDetailDialogProps {
  nodeId: string | null;
  graph: Graph<NodeAttributes, EdgeAttributes>;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
  onDelete: (nodeId: string) => Promise<boolean>;
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
  onDelete,
}: GraphNodeDetailDialogProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!nodeId || !graph.hasNode(nodeId)) return null;

  const attrs = graph.getNodeAttributes(nodeId);

  const neighborIds = graph.neighbors(nodeId);
  const neighbors = neighborIds.map((nId) => {
    const nAttrs = graph.getNodeAttributes(nId);
    let totalWeight = 0;
    graph.forEachEdge(nodeId, nId, (_edge, edgeAttrs) => {
      totalWeight += edgeAttrs.weight;
    });
    return { id: nId, label: nAttrs.label, weight: totalWeight };
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">{attrs.label}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {formatDate(attrs.createdAt)}
          </p>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_auto] gap-6">
          <div className="space-y-4 min-w-0">
            <p className="text-foreground break-words">{attrs.content}</p>

            {attrs.tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
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
            )}

            <div className="pt-2">
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      const deleted = await onDelete(nodeId);
                      setIsDeleting(false);
                      if (deleted) {
                        setConfirmingDelete(false);
                        onClose();
                      }
                    }}
                  >
                    {isDeleting ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                      <IconTrash size={14} />
                    )}
                    {isDeleting ? "Deleting..." : "Confirm"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <IconTrash size={14} />
                  Delete
                </Button>
              )}
            </div>
          </div>

          {neighbors.length > 0 && (
            <div className="w-72 border-l border-border pl-6">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Related
              </p>
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {neighbors.map((neighbor) => (
                  <Button
                    key={neighbor.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate(neighbor.id)}
                    className="w-full h-auto p-2.5 rounded-lg bg-muted/50 border border-border hover:bg-accent transition-colors justify-start items-start flex-col"
                  >
                    <p className="text-sm font-medium text-foreground truncate w-full text-left">
                      {neighbor.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {neighbor.weight} shared tag
                      {neighbor.weight > 1 ? "s" : ""}
                    </p>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
