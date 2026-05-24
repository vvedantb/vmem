import { Link } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vmem/ui";
import {
  IconDots,
  IconRefresh,
  IconTrash,
  IconExternalLink,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { CodebaseCardInsides, type CodebaseItem } from "./CodebaseCardInsides";

interface CodebaseCardProps {
  codebase: CodebaseItem;
}

export function CodebaseCard({ codebase }: CodebaseCardProps) {
  const syncCodebase = useAction(api.codebases.syncCodebase);
  const removeCodebase = useMutation(
    api.codebases.removeCodebase,
  ).withOptimisticUpdate((localStore, args) => {
    const list = localStore.getQuery(api.codebases.listMy, {});
    if (list) {
      localStore.setQuery(
        api.codebases.listMy,
        {},
        list.filter((row) => row._id !== args.id),
      );
    }
  });

  const handleSync = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await syncCodebase({ id: codebase._id });
      toast.success(`${codebase.repoName} synced`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      toast.error(msg);
    }
  };

  const handleDelete = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await removeCodebase({ id: codebase._id });
      toast.success(`Removed ${codebase.repoName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast.error(msg);
    }
  };

  const href = `/codebases/${codebase._id}`;

  const dropdownMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted transition-[opacity,background-color] text-muted-foreground hover:text-foreground"
        >
          <IconDots size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={handleSync}>
          <IconRefresh size={14} className="mr-2" />
          Re-sync
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={`https://github.com/${codebase.repoFullName}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <IconExternalLink size={14} className="mr-2" />
            View on GitHub
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <IconTrash size={14} className="mr-2" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const contextMenuItems = (
    <>
      <ContextMenuItem onClick={handleSync}>
        <IconRefresh size={14} className="mr-2" />
        Re-sync
      </ContextMenuItem>
      <ContextMenuItem asChild>
        <a
          href={`https://github.com/${codebase.repoFullName}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <IconExternalLink size={14} className="mr-2" />
          View on GitHub
        </a>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={handleDelete}
        className="text-destructive focus:text-destructive"
      >
        <IconTrash size={14} className="mr-2" />
        Remove
      </ContextMenuItem>
    </>
  );

  return (
    <>
      <div className="sm:hidden">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Link to={href} className="block">
              <CodebaseCardInsides codebase={codebase} headerMenuSlot={null} />
            </Link>
          </ContextMenuTrigger>
          <ContextMenuContent onClick={(e) => e.stopPropagation()}>
            {contextMenuItems}
          </ContextMenuContent>
        </ContextMenu>
      </div>

      <div className="hidden sm:block">
        <Link to={href}>
          <CodebaseCardInsides
            codebase={codebase}
            headerMenuSlot={dropdownMenu}
          />
        </Link>
      </div>
    </>
  );
}
