"use client";

import { useMemo } from "react";
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
import {
  aiLogsSearchParams,
  isAllProfilesFilter,
  PROFILE_FILTER_ALL,
  type Feature,
  type Range,
  type SortDirection,
  type StatusFilter,
} from "../-searchParams";
import { LogsSummary } from "./LogsSummary";
import { LogsFiltersDropdown } from "./LogsFiltersDropdown";
import { LogsTable } from "./LogsTable";

const PAGE_SIZE = 50;

/**
 * AI Logs panel for `/activity` — observability dashboard for every backend
 * AI call vmem fires on the user's behalf (chat completions + embeddings,
 * currently routed via OpenRouter).
 *
 * The orchestrator owns the scroll container; this panel reads its own
 * filter params and renders summary + filterable virtualised table.
 */
export function AiLogsPanel({
  scrollParent,
}: {
  scrollParent: HTMLDivElement | null;
}) {
  const [params, setParams] = useQueryStates(aiLogsSearchParams);

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
      status: params.status,
      range: params.range,
    };
  }, [
    params.scope,
    teamId,
    params.profileId,
    params.features,
    params.models,
    params.status,
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
    params.status !== "all" ||
    params.features.length > 0 ||
    params.models.length > 0 ||
    !isAllProfilesFilter(params.profileId);

  const resetFilters = () => {
    setParams({
      range: "7d",
      status: "all",
      features: [],
      models: [],
      profileId: PROFILE_FILTER_ALL,
    });
  };

  return (
    <div className="space-y-6">
      <LogsSummary scope={params.scope} teamId={teamId} range={params.range} />
      <LogsTable
        rows={orderedRows}
        isLoading={
          paged.status === "LoadingFirstPage" || paged.status === "LoadingMore"
        }
        hasMore={paged.status === "CanLoadMore"}
        onLoadMore={() => paged.loadMore(PAGE_SIZE)}
        onResetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        scrollParent={scrollParent}
        profilesById={profilesById}
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
    setParams({
      range: "7d",
      status: "all",
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
        status={params.status}
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
        onStatusChange={(status: StatusFilter) => setParams({ status })}
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
