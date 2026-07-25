import { useAction, useMutation, useQuery } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from "@vmem/ui";
import { IconLoader2, IconSearch } from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { sidebarSearchInputClassName } from "@/components/sidebar/sidebar-search-input";
import { GitHubIcon } from "@/components/icons/logos";
import { AddRepoModalRow } from "./_components/AddRepoModalRow";
import type { AddRepoModalRepo } from "./-types";
import { useActiveTeamId } from "@/components/workspace/active-profile";

interface AddRepoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: Id<"githubConnections">;
}

export function AddRepoModal({
  open,
  onOpenChange,
  connectionId,
}: AddRepoModalProps) {
  const teamId = useActiveTeamId();
  const listRepos = useAction(api.codebases.listRepos);
  const addCodebase = useMutation(
    api.codebases.addCodebase,
  ).withOptimisticUpdate((localStore, args) => {
    const listArgs = { teamId: args.teamId };
    const list = localStore.getQuery(api.codebases.listMy, listArgs);
    if (list === undefined) return;
    const now = Date.now();
    const tempId = crypto.randomUUID() as Id<"codebases">;
    localStore.setQuery(api.codebases.listMy, listArgs, [
      {
        _id: tempId,
        _creationTime: now,
        userId: list[0]?.userId ?? ("" as Id<"users">),
        teamId: args.teamId,
        githubConnectionId: args.githubConnectionId,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        repoFullName: args.repoFullName,
        defaultBranch: args.defaultBranch,
        language: args.language,
        description: args.description,
        isPrivate: args.isPrivate,
        status: "pending" as const,
        totalFiles: 0,
        syncedFiles: 0,
        avatarUrl: list[0]?.avatarUrl,
      },
      ...list,
    ]);
  });
  const codebases = useQuery(api.codebases.listMy, { teamId });
  const reposQuery = useTanstackQuery({
    queryKey: ["github-repos", connectionId],
    queryFn: async () => {
      try {
        return await listRepos();
      } catch {
        toast.error("Failed to fetch repositories");
        throw new Error("Failed to fetch repositories");
      }
    },
    enabled: open,
    staleTime: 60_000,
  });

  const repos = reposQuery.data ?? [];
  const loading = reposQuery.isLoading;
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const addedFullNames = new Set(
    (codebases ?? []).map((cb) => cb.repoFullName),
  );
  const availableRepos = repos.filter(
    (repo) => !addedFullNames.has(repo.fullName),
  );
  const searchQuery = search.trim().toLowerCase();
  const filtered =
    searchQuery.length === 0
      ? availableRepos
      : availableRepos.filter(
          (repo) =>
            repo.fullName.toLowerCase().includes(searchQuery) ||
            (repo.description?.toLowerCase().includes(searchQuery) ?? false) ||
            (repo.language?.toLowerCase().includes(searchQuery) ?? false),
        );

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const handleAdd = async (repo: AddRepoModalRepo) => {
    setAdding(repo.fullName);
    try {
      await addCodebase({
        githubConnectionId: connectionId,
        repoOwner: repo.owner,
        repoName: repo.name,
        repoFullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        language: repo.language ?? undefined,
        description: repo.description ?? undefined,
        isPrivate: repo.isPrivate,
        teamId,
      });
      toast.success(`Added ${repo.fullName}`);
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add repository";
      toast.error(message);
    } finally {
      setAdding(null);
    }
  };

  const listSummary = loading
    ? null
    : `${filtered.length} ${filtered.length === 1 ? "repository" : "repositories"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="space-y-3 px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-secondary/60">
              <GitHubIcon size={22} />
            </div>
            <div className="min-w-0 space-y-1 pt-0.5">
              <DialogTitle className="text-foreground">
                Add repository
              </DialogTitle>
              <DialogDescription>
                Pick a GitHub repo to index. vmem will parse imports and symbols
                after you add it.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 pb-3">
          <div className="relative">
            <IconSearch
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              placeholder="Search repositories"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(sidebarSearchInputClassName, "h-9")}
              aria-label="Search repositories"
            />
          </div>
        </div>

        <div className="px-4 pb-4">
          <div
            className={cn(
              "max-h-[min(24rem,50vh)] overflow-y-auto rounded-lg bg-surface-secondary/40 p-1 scrollbar-thin",
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center py-14">
                <IconLoader2 size={20} className="animate-spin text-muted" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-14 text-center text-sm text-muted">
                {emptyRepoListMessage(
                  search,
                  availableRepos.length,
                  repos.length,
                )}
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {filtered.map((repo) => (
                  <AddRepoModalRow
                    key={repo.id}
                    repo={repo}
                    isAdding={adding === repo.fullName}
                    disabled={adding !== null}
                    onAdd={() => void handleAdd(repo)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {listSummary ? (
          <p className="px-6 pb-5 text-xs text-muted tabular-nums">
            {listSummary}
            {addedFullNames.size > 0 && repos.length > availableRepos.length
              ? ` · ${addedFullNames.size} already added`
              : null}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function emptyRepoListMessage(
  search: string,
  availableCount: number,
  totalCount: number,
): string {
  if (search.trim().length > 0) {
    return "No matching repositories";
  }
  if (availableCount === 0 && totalCount > 0) {
    return "All accessible repositories are already added";
  }
  return "No repositories found on your GitHub account";
}
