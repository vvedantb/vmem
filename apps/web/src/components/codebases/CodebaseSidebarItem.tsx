import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import {
  IconAlertTriangle,
  IconArchive,
  IconArchiveOff,
  IconLoader2,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { CodebaseSidebarCard } from "./CodebaseSidebarCard";
import type { CodebaseItem } from "./-types";
import { updateAllCachedQueries } from "@/lib/convex-optimistic";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";

interface CodebaseSidebarItemProps {
  codebase: CodebaseItem;
  selected: boolean;
  onSelect: () => void;
}

// sidebar codebase row with a right-click context menu for archiving and deleting
export function CodebaseSidebarItem({
  codebase,
  selected,
  onSelect,
}: CodebaseSidebarItemProps) {
  const setArchived = useMutation(
    api.codebases.setArchived,
  ).withOptimisticUpdate((localStore, args) => {
    updateAllCachedQueries(localStore, api.codebases.listMy, (list) =>
      list.map((c) =>
        c._id === args.id ? { ...c, isArchived: args.archived } : c,
      ),
    );
    for (const entry of localStore.getAllQueries(api.codebases.getById)) {
      if (entry.value == null || entry.value._id !== args.id) continue;
      localStore.setQuery(api.codebases.getById, entry.args, {
        ...entry.value,
        isArchived: args.archived,
      });
    }
  });
  const removeCodebase = useMutation(
    api.codebases.removeCodebase,
  ).withOptimisticUpdate((localStore, args) => {
    updateAllCachedQueries(localStore, api.codebases.listMy, (list) =>
      list.filter((c) => c._id !== args.id),
    );
    for (const entry of localStore.getAllQueries(api.codebases.getById)) {
      if (entry.args.id === args.id) {
        localStore.setQuery(api.codebases.getById, entry.args, undefined);
      }
    }
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const { submitting: deleting, run: runDelete } = useAsyncSubmit();

  const isArchived = codebase.isArchived ?? false;

  const handleArchiveToggle = async () => {
    try {
      await setArchived({ id: codebase._id, archived: !isArchived });
      toast.success(
        isArchived
          ? `Unarchived ${codebase.repoName}`
          : `Archived ${codebase.repoName}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    await runDelete(async () => {
      await removeCodebase({ id: codebase._id });
      toast.success(`Deleted ${codebase.repoName}`);
      setConfirmOpen(false);
    }, "Delete failed");
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>
            <CodebaseSidebarCard
              codebase={codebase}
              selected={selected}
              onSelect={onSelect}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => void handleArchiveToggle()}>
            {isArchived ? (
              <IconArchiveOff size={14} className="mr-2" />
            ) : (
              <IconArchive size={14} className="mr-2" />
            )}
            {isArchived ? "Unarchive" : "Archive"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => setConfirmOpen(true)}
            className="text-danger focus:text-danger data-[highlighted]:text-danger"
          >
            <IconTrash size={14} className="mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleting) setConfirmOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Delete codebase
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirm deleting a codebase
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger/10">
              <IconAlertTriangle size={20} className="text-danger" />
            </div>
            <div>
              <p className="text-foreground">
                Delete{" "}
                <span className="font-medium">{codebase.repoFullName}</span>{" "}
                permanently?
              </p>
              <p className="mt-1 text-sm text-muted">
                This removes the codebase and all of its indexed graph data.
                This cannot be undone.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
              className="text-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="bg-danger text-danger-foreground"
            >
              {deleting ? (
                <>
                  <IconLoader2 size={16} className="animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete codebase"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
