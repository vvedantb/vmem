"use client";

import { useEffect, useMemo } from "react";
import { useQueryStates } from "nuqs";
import { useQuery, usePaginatedQuery } from "convex/react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@vmem/ui";
import { IconSortDescending, IconSortAscending } from "@tabler/icons-react";
import { api, type Id } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import {
  aiLogsSearchParams,
  isAllProfilesFilter,
  PROFILE_FILTER_ALL,
  type Feature,
  type Range,
  type SortDirection,
} from "../-searchParams";
import { LogsSummary } from "./LogsSummary";
import { LogsFiltersDropdown } from "./LogsFiltersDropdown";
import { LogsTable } from "./LogsTable";
import { computeAiLogsTrends } from "./_aiLogsUtils";
import { AiLogsLoadingSkeleton } from "./AiLogsLoadingSkeleton";

const PAGE_SIZE = 50;

/**
 * AI Logs panel for `/activity` — observability dashboard for every backend
 * AI call vmem fires on the user's behalf (chat completions + embeddings,
 * currently routed via OpenRouter).
 *
 * Reads filter params from the URL and renders summary + filterable
 * virtualised table (table scrolls inside a capped card region).
 */
export function AiLogsPanel() {
  const [params, setParams] = useQueryStates(aiLogsSearchParams);
  const activeProfile = useActiveProfile();

  // Keep AI logs scoped to the active workspace so a team route never opens
  // on personal spend (and vice versa) via the static `personal` URL default.
  useEffect(() => {
    if (activeProfile.teamId !== undefined) {
      if (params.scope !== "team" || params.teamId !== activeProfile.teamId) {
        void setParams({
          scope: "team",
          teamId: activeProfile.teamId,
          profileId: PROFILE_FILTER_ALL,
        });
      }
      return;
    }
    if (params.scope === "team") {
      void setParams({
        scope: "personal",
        teamId: "",
        profileId: PROFILE_FILTER_ALL,
      });
    }
  }, [
    activeProfile.teamId,
    activeProfile._id,
    params.scope,
    params.teamId,
    setParams,
  ]);

  // Profiles + teams power the scope selector and the per-row profile badge
  // lookup. Both are user-scoped queries — we don't need to gate on auth
  // here because TanStack Router's `_main` route already does.
  const profiles = useQuery(api.profiles.list);
  const teams = useQuery(api.teams.list);

  const teamId =
    params.scope === "team" && params.teamId.length > 0
      ? normalizeTeamId(params.teamId, teams)
      : undefined;

  const listArgs = useMemo(() => {
    if (params.scope === "team" && !teamId) return "skip" as const;
    return {
      scope: params.scope,
      teamId,
      profileId: isAllProfilesFilter(params.profileId)
        ? undefined
        : normalizeProfileId(params.profileId, profiles),
      features: params.features.length > 0 ? params.features : undefined,
      models: params.models.length > 0 ? params.models : undefined,
      range: params.range,
    };
  }, [
    params.scope,
    teamId,
    params.profileId,
    params.features,
    params.models,
    params.range,
    profiles,
  ]);

  const paged = usePaginatedQuery(api.openRouterLogs.listMine, listArgs, {
    initialNumItems: PAGE_SIZE,
  });

  const orderedRows = useMemo(() => {
    if (params.sortDir === "asc") return [...paged.results].reverse();
    return paged.results;
  }, [paged.results, params.sortDir]);

  const summaryArgs = useMemo(() => {
    if (params.scope === "team" && !teamId) return "skip" as const;
    return {
      scope: params.scope,
      teamId,
      range: params.range,
    };
  }, [params.scope, teamId, params.range]);

  const summary = useQuery(api.openRouterLogs.summaryMine, summaryArgs);

  const trends = useMemo(
    () => computeAiLogsTrends(paged.results),
    [paged.results],
  );

  const profilesById = useMemo(() => {
    const map = new Map<
      string,
      { _id: string; name: string; color?: string }
    >();
    for (const p of profiles ?? []) {
      map.set(p._id, { _id: p._id, name: p.name, color: p.color });
    }
    return map;
  }, [profiles]);

  const hasActiveFilters =
    params.range !== "7d" ||
    params.features.length > 0 ||
    params.models.length > 0 ||
    !isAllProfilesFilter(params.profileId);

  const resetFilters = () => {
    void setParams({
      range: "7d",
      features: [],
      models: [],
      profileId: PROFILE_FILTER_ALL,
    });
  };

  if (summary === undefined && paged.status === "LoadingFirstPage") {
    return <AiLogsLoadingSkeleton />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-8">
      <LogsSummary summary={summary} range={params.range} trends={trends} />
      <LogsTable
        rows={orderedRows}
        isLoading={
          paged.status === "LoadingFirstPage" || paged.status === "LoadingMore"
        }
        hasMore={paged.status === "CanLoadMore"}
        onLoadMore={() => paged.loadMore(PAGE_SIZE)}
        onResetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        profilesById={profilesById}
        totalCalls={summary?.totalCalls}
      />
    </div>
  );
}

/**
 * Right-section actions for the AI Logs tab — filters dropdown and sort
 * dropdown. Reads/writes the same `aiLogsSearchParams` as `AiLogsPanel`.
 */
export function AiLogsRightSection() {
  const [params, setParams] = useQueryStates(aiLogsSearchParams);
  const profiles = useQuery(api.profiles.list);
  const teams = useQuery(api.teams.list);

  const teamId =
    params.scope === "team" && params.teamId.length > 0
      ? normalizeTeamId(params.teamId, teams)
      : undefined;

  const distinctModelsArgs =
    params.scope === "team"
      ? teamId
        ? { scope: params.scope, teamId }
        : "skip"
      : { scope: params.scope };
  const availableModelsResult = useQuery(
    api.openRouterLogs.distinctModelsMine,
    distinctModelsArgs,
  );
  const availableModels = availableModelsResult ?? [];

  const resetFilters = () => {
    void setParams({
      range: "7d",
      features: [],
      models: [],
      profileId: PROFILE_FILTER_ALL,
    });
  };

  const teamOptions = (teams ?? []).map((t) => ({
    _id: t.team._id,
    name: t.team.name,
  }));

  return (
    <div className="flex items-center gap-2">
      <LogsFiltersDropdown
        scope={params.scope}
        teamId={params.teamId}
        teams={teamOptions}
        onScopeChange={(scope, nextTeamId) =>
          setParams({ scope, teamId: nextTeamId ?? "" })
        }
        range={params.range}
        features={params.features}
        models={params.models}
        availableModels={availableModels}
        profileId={params.profileId}
        profiles={profiles?.map((p) => ({
          _id: p._id,
          name: p.name,
          color: p.color,
        }))}
        onRangeChange={(range: Range) => setParams({ range })}
        onFeaturesChange={(features: Feature[]) => setParams({ features })}
        onModelsChange={(models) => setParams({ models })}
        onProfileChange={(profileId) => setParams({ profileId })}
        onReset={resetFilters}
      />
      <SortDropdown
        sortDir={params.sortDir}
        onChange={(sortDir) => setParams({ sortDir })}
      />
    </div>
  );
}

function SortDropdown({
  sortDir,
  onChange,
}: {
  sortDir: SortDirection;
  onChange: (sortDir: SortDirection) => void;
}) {
  const Icon = sortDir === "desc" ? IconSortDescending : IconSortAscending;
  const label = sortDir === "desc" ? "Newest" : "Oldest";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Icon size={16} />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Sort</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sortDir}
          onValueChange={(v) => {
            if (v === "asc" || v === "desc") onChange(v);
          }}
        >
          <DropdownMenuRadioItem value="desc">
            Newest first
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="asc">
            Oldest first
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Helpers — match a string to a typed Id by checking against the user's
// known set, so we never push a malformed id to the backend.
function normalizeTeamId(
  raw: string,
  teams: { team: { _id: Id<"teams"> } }[] | undefined,
): Id<"teams"> | undefined {
  if (!teams) return undefined;
  const match = teams.find((t) => t.team._id === raw);
  return match?.team._id;
}

function normalizeProfileId(
  raw: string,
  profiles: { _id: Id<"profiles"> }[] | undefined,
): Id<"profiles"> | undefined {
  if (!profiles) return undefined;
  const match = profiles.find((p) => p._id === raw);
  return match?._id;
}
