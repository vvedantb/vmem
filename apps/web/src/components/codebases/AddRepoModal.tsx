"use client";

import { useAction, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@vmem/ui";
import { IconLoader2, IconLock, IconSearch } from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";

type RepoItem = FunctionReturnType<typeof api.codebases.listRepos>[number];

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
  const listRepos = useAction(api.codebases.listRepos);
  const addCodebase = useMutation(api.codebases.addCodebase);

  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const fetchRepos = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listRepos();
      setRepos(result);
    } catch {
      toast.error("Failed to fetch repositories");
    } finally {
      setLoading(false);
    }
  }, [listRepos]);

  useEffect(() => {
    if (open) {
      fetchRepos();
    }
  }, [open, fetchRepos]);

  const filtered = repos.filter((r) =>
    r.fullName.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAdd = async (repo: RepoItem) => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Repository</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <IconSearch
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="max-h-80 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <IconLoader2
                size={20}
                className="animate-spin text-muted-foreground"
              />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {search ? "No matching repositories" : "No repositories found"}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((repo) => (
                <button
                  key={repo.id}
                  type="button"
                  disabled={adding !== null}
                  onClick={() => handleAdd(repo)}
                  className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left hover:bg-muted/80 transition-colors disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground truncate">
                        {repo.fullName}
                      </span>
                      {repo.isPrivate && (
                        <IconLock
                          size={12}
                          className="text-muted-foreground shrink-0"
                        />
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {repo.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {repo.language && (
                      <span className="text-xs text-muted-foreground">
                        {repo.language}
                      </span>
                    )}
                    {adding === repo.fullName && (
                      <IconLoader2 size={14} className="animate-spin" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
