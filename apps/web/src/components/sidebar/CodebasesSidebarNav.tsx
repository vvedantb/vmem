"use client";

import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import { motion } from "motion/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { PARSER_VERSION } from "@vmem/shared";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  motionDuration,
  motionEase,
} from "@vmem/ui";
import {
  IconAlertCircle,
  IconArchive,
  IconChevronRight,
  IconDatabase,
  IconLoader2,
  IconPlus,
  IconRefresh,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { CodebaseSidebarItem } from "@/components/codebases/CodebaseSidebarItem";
import { CodebasesSearchBar } from "@/components/codebases/CodebasesSearchBar";
import { AddRepoModal } from "@/components/codebases/AddRepoModal";
import { codebasesListSearchParams } from "@/routes/_main/$profileId/codebases/-list-searchParams";
import { useActiveProfileId } from "@/components/workspace/active-profile";

export type CodebasesSidebarNavProps = {
  isIconOnly: boolean;
  isMobile: boolean;
};

export function CodebasesSidebarNav({
  isIconOnly,
  isMobile,
}: CodebasesSidebarNavProps) {
  const navigate = useNavigate();
  const profileId = useActiveProfileId();
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
          !cb.isArchived &&
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

  const activeCodebases = useMemo(
    () => filteredCodebases.filter((cb) => !cb.isArchived),
    [filteredCodebases],
  );
  const archivedCodebases = useMemo(
    () => filteredCodebases.filter((cb) => cb.isArchived),
    [filteredCodebases],
  );

  const openCodebase = (id: Id<"codebases">) => {
    if (profileId === undefined) return;
    void navigate({
      to: "/$profileId/codebases/$id",
      params: { profileId, id },
    });
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
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
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
              <>
                <div className="flex flex-col gap-0.5">
                  {activeCodebases.map((codebase) => (
                    <CodebaseSidebarItem
                      key={codebase._id}
                      codebase={codebase}
                      selected={codebaseId === codebase._id}
                      onSelect={() => openCodebase(codebase._id)}
                    />
                  ))}
                </div>

                {!isIconOnly && archivedCodebases.length > 0 ? (
                  <Collapsible className="mt-2">
                    <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted transition-[background-color] hover:bg-surface-tertiary">
                      <IconChevronRight
                        size={14}
                        className="shrink-0 transition-transform group-data-[state=open]:rotate-90"
                      />
                      <IconArchive size={14} className="shrink-0" />
                      <span>Archived</span>
                      <span className="ml-auto tabular-nums">
                        {archivedCodebases.length}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-0.5 flex flex-col gap-0.5">
                      {archivedCodebases.map((codebase) => (
                        <CodebaseSidebarItem
                          key={codebase._id}
                          codebase={codebase}
                          selected={codebaseId === codebase._id}
                          onSelect={() => openCodebase(codebase._id)}
                        />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </>
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
