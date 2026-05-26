import { useEffect, useState, useMemo } from "react";
import { useAction, useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";
import { Badge, Button, Card, CardContent, Input } from "@vmem/ui";
import {
  IconSearch,
  IconLoader2,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { toast } from "sonner";
import type { TeamDetail } from "../-team-detail";
import { teamKnowledgeSearchParams } from "../-searchParams";

type MemoryListResult = FunctionReturnType<
  typeof api.memoryApi.listTeamMemories
>;
type TeamMemory = MemoryListResult["memories"][number];

/**
 * Team knowledge tab: the memory list filtered to the team profile, with a
 * "Saved by" attribution chip so members can see whose memory they're looking
 * at. Creators and team owners get a delete action.
 */
export function TeamKnowledge({ data }: { data: TeamDetail }) {
  const [params, setParams] = useQueryStates(teamKnowledgeSearchParams);
  const listTeamMemories = useAction(api.memoryApi.listTeamMemories);
  const deleteTeamMemory = useAction(api.memoryApi.deleteTeamMemory);
  const currentUser = useQuery(api.users.getMe);
  const [memories, setMemories] = useState<TeamMemory[] | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const profileId = data.profile?._id;
  const refreshKey = useMemo(() => ({ profileId }), [profileId]);

  useEffect(() => {
    let cancelled = false;
    if (!profileId) {
      setMemories([]);
      return;
    }
    setMemories(null);
    listTeamMemories({ profileId, limit: 200, offset: 0 })
      .then((r) => {
        if (!cancelled) setMemories(r.memories);
      })
      .catch(() => {
        if (!cancelled) setMemories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, profileId, listTeamMemories]);

  // Attribution lookup keyed by clerkId.
  const clerkIds = useMemo(
    () => Array.from(new Set((memories ?? []).map((m) => m.userId))),
    [memories],
  );
  const attribution = useQuery(
    api.users.getByClerkIds,
    clerkIds.length > 0 ? { clerkIds } : "skip",
  );

  const filtered = useMemo(() => {
    if (!memories) return null;
    const q = params.q.trim().toLowerCase();
    const tagSet = new Set(params.tags.map((t) => t.toLowerCase()));
    return memories.filter((m) => {
      if (q) {
        const haystack = `${m.title} ${m.content}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (tagSet.size > 0) {
        const has = m.tags.some((t) => tagSet.has(t.toLowerCase()));
        if (!has) return false;
      }
      return true;
    });
  }, [memories, params.q, params.tags]);

  const isOwner = data.role === "owner";
  const myClerkId = currentUser?.clerkId ?? null;

  const handleDelete = async (memory: TeamMemory) => {
    if (!profileId) return;
    const confirm = window.confirm(`Delete "${memory.title}"?`);
    if (!confirm) return;
    setLoadingAction(memory.id);
    try {
      await deleteTeamMemory({ profileId, memoryId: memory.id });
      toast.success("Memory deleted");
      setMemories((prev) => prev?.filter((m) => m.id !== memory.id) ?? prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setLoadingAction(null);
    }
  };

  if (!profileId) {
    return (
      <div className="text-sm text-muted">
        This team has no profile attached.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <IconSearch
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            placeholder="Search team knowledge..."
            value={params.q}
            onChange={(e) =>
              void setParams({ q: e.target.value }, { shallow: true })
            }
            className="pl-9"
          />
        </div>
      </div>

      <Card className="shadow-none">
        <CardContent className="p-2">
          {memories === null ? (
            <div className="flex items-center justify-center py-10">
              <IconLoader2 size={20} className="animate-spin text-muted" />
            </div>
          ) : (filtered ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">
              {memories.length === 0
                ? "No memories saved to this team yet."
                : "No memories match your search."}
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {(filtered ?? []).map((m) => {
                const attr = attribution?.[m.userId];
                const name = attr
                  ? attr.fullName ||
                    [attr.firstName, attr.lastName].filter(Boolean).join(" ") ||
                    attr.email ||
                    "Unknown"
                  : m.userId;
                const canDelete = isOwner || m.userId === myClerkId;
                return (
                  <li
                    key={m.id}
                    className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-[background-color] hover:bg-surface-tertiary/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {m.title}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {m.type}
                        </Badge>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted">
                        {m.content}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <IconUser size={12} />
                          Saved by {name}
                        </span>
                        {m.tags.slice(0, 4).map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(m)}
                        disabled={loadingAction === m.id}
                        className="text-muted hover:text-danger"
                      >
                        {loadingAction === m.id ? (
                          <IconLoader2 size={14} className="animate-spin" />
                        ) : (
                          <IconTrash size={14} />
                        )}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
