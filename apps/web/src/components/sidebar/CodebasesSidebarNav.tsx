"use client";

import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import { motion } from "motion/react";
import { api, PARSER_VERSION } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import {
  IconAlertCircle,
  IconDatabase,
  IconLoader2,
  IconPlus,
  IconRefresh,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { CodebaseSidebarCard } from "@/components/codebases/CodebaseSidebarCard";
import { CodebasesSearchBar } from "@/components/codebases/CodebasesSearchBar";
import { AddRepoModal } from "@/components/codebases/AddRepoModal";
import { codebasesListSearchParams } from "@/routes/_main/codebases/-list-searchParams";

export type CodebasesSidebarNavProps = {
  isIconOnly: boolean;
  isMobile: boolean;
};

export function CodebasesSidebarNav({
  isIconOnly,
  isMobile,
}: CodebasesSidebarNavProps) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const codebaseId = typeof params.id === "string" ? params.id : undefined;

  const connection = useQuery(api.github.getConnection);
  const codebases = useQuery(api.codebases.listMy);
  const syncAllMy = useAction(api.codebases.syncAllMy);
  const [{ q: searchQuery }, setSearchParams] = useQueryStates(
    codebasesListSearchParams,
  );
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const isConnected = connection !== undefined && connection !== null;

  const staleCodebases = useMemo(
    () =>
      (codebases ?? []).filter(
        (cb) =>
          cb.status === "synced" &&
          (cb.parserVersion === undefined ||
            cb.parserVersion !== PARSER_VERSION),
      ),
    [codebases],
  );

  const filteredCodebases = useMemo(() => {
    if (!codebases) return [];
    const query = searchQuery.trim().toLowerCase();
    if (query.length === 0) return codebases;
    return codebases.filter(
      (cb) =>
        cb.repoName.toLowerCase().includes(query) ||
        cb.repoOwner.toLowerCase().includes(query) ||
        cb.repoFullName.toLowerCase().includes(query) ||
        (cb.language?.toLowerCase().includes(query) ?? false) ||
        (cb.description?.toLowerCase().includes(query) ?? false),
    );
  }, [codebases, searchQuery]);

  const openCodebase = (id: Id<"codebases">) => {
    void navigate({ to: "/codebases/$id", params: { id } });
  };

  const handleResyncAll = useCallback(async () => {
    setResyncing(true);
    try {
      const result = await syncAllMy({});
      toast.success(`Re-syncing ${result.synced} codebase(s)`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start re-sync";
      toast.error(message);
    } finally {
      setResyncing(false);
    }
  }, [syncAllMy]);

  return (
    <motion.nav
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin px-1">
        {!isIconOnly && staleCodebases.length > 0 ? (
          <div className="mb-2 rounded-lg bg-warning/10 p-2.5">
            <div className="flex items-start gap-2">
              <IconAlertCircle
                size={14}
                className="mt-0.5 shrink-0 text-warning"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">
                  Parser {PARSER_VERSION}
                </p>
                <p className="text-[11px] text-muted">
                  {staleCodebases.length} repo
                  {staleCodebases.length === 1 ? "" : "s"} need re-sync
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 w-full text-xs"
              onClick={handleResyncAll}
              disabled={resyncing}
            >
              {resyncing ? (
                <IconLoader2 size={12} className="animate-spin" />
              ) : (
                <IconRefresh size={12} />
              )}
              {resyncing ? "Starting…" : "Re-sync all"}
            </Button>
          </div>
        ) : null}

        {codebases === undefined ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
          </div>
        ) : codebases.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
            <IconDatabase size={28} className="mb-2 text-muted" />
            {!isIconOnly ? (
              <p className="text-xs text-muted">
                {isConnected ? "No repositories yet" : "Connect GitHub"}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {!isIconOnly ? (
              <CodebasesSearchBar
                value={searchQuery}
                onChange={(value) => {
                  void setSearchParams({ q: value });
                }}
              />
            ) : null}
            {filteredCodebases.length === 0 ? (
              !isIconOnly ? (
                <p className="px-2 py-4 text-center text-xs text-muted">
                  No repositories match your search.
                </p>
              ) : null
            ) : (
              <div className="flex flex-col gap-0.5">
                {filteredCodebases.map((codebase) => (
                  <CodebaseSidebarCard
                    key={codebase._id}
                    codebase={codebase}
                    selected={codebaseId === codebase._id}
                    onSelect={() => openCodebase(codebase._id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!isIconOnly ? (
        <div className="shrink-0 space-y-2 px-1 pt-2">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setAddModalOpen(true)}
            >
              <IconPlus size={16} />
              Add repository
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/settings/connectors">Connect GitHub</Link>
            </Button>
          )}
        </div>
      ) : null}

      {isConnected && connection ? (
        <AddRepoModal
          open={addModalOpen}
          onOpenChange={setAddModalOpen}
          connectionId={connection.id}
        />
      ) : null}
    </motion.nav>
  );
}
