import { useQuery } from "convex/react";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";
import { IconBrain, IconUsers, IconClock } from "@tabler/icons-react";
import type { TeamDetail } from "../index";

type MemoryListResult = FunctionReturnType<
  typeof api.memoryApi.listTeamMemories
>;

/**
 * Stat cards + recent activity for a team.
 * Fetches the full team memory list once and derives counts locally. This is
 * fine for the MVP — if teams grow large we can add a dedicated count query.
 */
export function TeamOverview({ data }: { data: TeamDetail }) {
  const listTeamMemories = useAction(api.memoryApi.listTeamMemories);
  const [result, setResult] = useState<MemoryListResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attribution = useQuery(
    api.users.getByClerkIds,
    result
      ? { clerkIds: Array.from(new Set(result.memories.map((m) => m.userId))) }
      : "skip",
  );

  useEffect(() => {
    let cancelled = false;
    if (!data.profile) return;
    setError(null);
    listTeamMemories({
      profileId: data.profile._id,
      limit: 200,
      offset: 0,
    })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [data.profile, listTeamMemories]);

  if (!data.profile) {
    return (
      <div className="text-sm text-muted-foreground">
        This team has no profile attached.
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Failed to load team stats: {error}
      </div>
    );
  }

  const memories = result?.memories ?? [];
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = memories.filter(
    (m) => new Date(m.createdAt).getTime() > oneWeekAgo,
  );
  const activeContributors = new Set(recent.map((m) => m.userId)).size;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={<IconBrain size={16} />}
          label="Total memories"
          value={result ? String(result.total) : "—"}
        />
        <StatCard
          icon={<IconClock size={16} />}
          label="New this week"
          value={result ? String(recent.length) : "—"}
        />
        <StatCard
          icon={<IconUsers size={16} />}
          label="Active contributors"
          value={result ? String(activeContributors) : "—"}
        />
        <StatCard
          icon={<IconUsers size={16} />}
          label="Members"
          value={String(data.members.length)}
        />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">
          Recent activity
        </h3>
        {result === null ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : memories.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No memories yet. Members can start saving to {data.team.name} from
            the profile dropdown.
          </div>
        ) : (
          <ul className="space-y-2">
            {memories.slice(0, 10).map((m) => {
              const attr = attribution?.[m.userId];
              const name = attr
                ? attr.fullName ||
                  [attr.firstName, attr.lastName].filter(Boolean).join(" ") ||
                  attr.email ||
                  "Unknown"
                : m.userId;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">
                      {m.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Saved by {name}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-instrumentSerif text-foreground">
        {value}
      </div>
    </div>
  );
}
