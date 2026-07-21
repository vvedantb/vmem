import { useState } from "react";
import { IconX, IconTrash, IconLoader2 } from "@tabler/icons-react";
import { Badge, Button } from "@vmem/ui";
import { formatDate } from "@/lib/formatters";
import { AnimatePresence, motion } from "motion/react";
import type { RelatedNode } from "@/lib/graph/types";
import type { GraphDetailNode } from "@/lib/graph/graph-types";

interface GraphDetailPanelProps {
  nodeData: GraphDetailNode | null;
  relatedNodes: RelatedNode[];
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
  onDelete: (nodeId: string) => Promise<boolean>;
}

export default function GraphDetailPanel({
  nodeData,
  relatedNodes,
  onClose,
  onNavigate,
  onDelete,
}: GraphDetailPanelProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <AnimatePresence initial={false}>
      {nodeData && (
        <motion.div
          key="detail-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="absolute top-0 right-0 bottom-0 w-96 z-20 glass-panel-strong overflow-y-auto hidden md:flex flex-col"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-4 pb-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-foreground truncate text-balance">
                {nodeData.title}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {formatDate(nodeData.createdAt)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="ml-2 shrink-0 text-muted hover:text-foreground"
              aria-label="Close panel"
            >
              <IconX size={16} />
            </Button>
          </div>

          {/* Content */}
          <div className="px-4 py-2 flex-1 min-h-0">
            {nodeData.content === undefined ? (
              <div className="flex items-center gap-2 text-xs text-muted">
                <IconLoader2 size={12} className="animate-spin" />
                Loading content…
              </div>
            ) : (
              <p className="text-sm text-foreground/90 break-words whitespace-pre-wrap">
                {nodeData.content}
              </p>
            )}

            {/* Tags */}
            {nodeData.tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-3">
                {nodeData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4">
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      const deleted = await onDelete(nodeData.id);
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
                  className="text-danger hover:text-danger hover:bg-danger/10"
                >
                  <IconTrash size={14} />
                  Delete
                </Button>
              )}
            </div>

            {/* Related nodes */}
            {relatedNodes.length > 0 && (
              <div className="mt-6 border-t border-separator pt-4">
                <p className="text-xs font-medium text-muted mb-2">
                  Related ({relatedNodes.length})
                </p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {relatedNodes.map((neighbor) => (
                    <Button
                      key={neighbor.id}
                      type="button"
                      variant="ghost"
                      onClick={() => onNavigate(neighbor.id)}
                      className="h-auto w-full rounded-lg bg-surface-secondary/50 p-2.5 text-left hover:bg-surface-tertiary"
                    >
                      <p className="text-sm font-medium text-foreground truncate">
                        {neighbor.title}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {neighbor.weight} shared tag
                        {neighbor.weight > 1 ? "s" : ""}
                      </p>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
