import { useState } from "react";
import {
  IconTrash,
  IconFocusCentered,
  IconLoader2,
  IconX,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@vvedantb/ui";
import { formatDate } from "@/lib/formatters";
import type { RelatedNode } from "@/lib/graph/types";
import type { GraphDetailNode } from "@/lib/graph/graph-types";
import {
  ConfirmSkipHint,
  skipConfirmTitle,
  useRequestConfirm,
} from "@vvedantb/ui/app";

interface GraphDetailPanelProps {
  nodeData: GraphDetailNode | null;
  relatedNodes: RelatedNode[];
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
  onDelete: (nodeId: string) => Promise<boolean>;
  onFocusNode: (nodeId: string) => void;
}

async function runGraphDelete(
  onDelete: (nodeId: string) => Promise<boolean>,
  nodeId: string,
): Promise<boolean> {
  try {
    return await onDelete(nodeId);
  } catch {
    return false;
  }
}

export default function GraphDetailPanel({
  nodeData,
  relatedNodes,
  onClose,
  onNavigate,
  onDelete,
  onFocusNode,
}: GraphDetailPanelProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { request } = useRequestConfirm();

  return (
    <Sheet
      open={nodeData !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      direction="right"
      modal={false}
      dismissible={false}
    >
      <SheetContent
        aria-describedby={undefined}
        className="inset-y-0 right-0 w-96 max-w-none rounded-none hidden md:flex flex-col glass-panel-strong"
      >
        <SheetHeader className="flex-row items-start justify-between gap-0 p-4 pb-2">
          {nodeData && (
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold text-foreground truncate text-balance">
                {nodeData.title}
              </SheetTitle>
              <p className="text-xs text-muted mt-0.5">
                {formatDate(nodeData.createdAt)}
              </p>
            </div>
          )}
          <SheetClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-2 shrink-0 text-muted hover:text-foreground"
              aria-label="Close panel"
            >
              <IconX size={16} />
            </Button>
          </SheetClose>
        </SheetHeader>
        {nodeData && (
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

            {nodeData.tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-3">
                {nodeData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFocusNode(nodeData.id)}
              >
                <IconFocusCentered size={14} />
                Focus
              </Button>
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      const deleted = await runGraphDelete(
                        onDelete,
                        nodeData.id,
                      );
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
                  title={skipConfirmTitle("Delete")}
                  onClick={(event) =>
                    request(
                      () => setConfirmingDelete(true),
                      () => {
                        void (async () => {
                          setIsDeleting(true);
                          const deleted = await runGraphDelete(
                            onDelete,
                            nodeData.id,
                          );
                          setIsDeleting(false);
                          if (deleted) {
                            setConfirmingDelete(false);
                            onClose();
                          }
                        })();
                      },
                      event,
                    )
                  }
                  className="text-danger hover:text-danger hover:bg-danger/10"
                >
                  <IconTrash size={14} />
                  Delete
                  <ConfirmSkipHint />
                </Button>
              )}
            </div>

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
        )}
      </SheetContent>
    </Sheet>
  );
}
