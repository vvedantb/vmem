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
import { useActiveProfile } from "@/components/workspace/active-profile";
import {
  aiLogsSearchParams,
  isAllProfilesFilter,
  PROFILE_FILTER_ALL,
  type Feature,
  type Range,
  type Scope,
  type SortDirection,
} from "@/lib/url-state/activity";
import { LogsSummary } from "./LogsSummary";
import { LogsFiltersDropdown } from "./LogsFiltersDropdown";
import { LogsTable } from "./LogsTable";
import { computeAiLogsTrends } from "./_aiLogsUtils";
import { AiLogsLoadingSkeleton } from "./AiLogsLoadingSkeleton";
import type { ProfileListItem, TeamListItem } from "./types";

const PAGE_SIZE = 50;

// effective scope for the AI logs, derived rather than written back to the URL
function useAiLogsScope(params: {
  scope: Scope | null;
  teamId: string | null;
}) {
  const activeProfile = useActiveProfile();
  if (params.scope !== null) {
    return { scope: params.scope, teamIdParam: params.teamId ?? "" };
  }
  if (activeProfile.teamId !== undefined) {
    return { scope: "team" as const, teamIdParam: activeProfile.teamId };
  }
  return { scope: "personal" as const, teamIdParam: "" };
}

// LLM usage panel for `/activity/usage`
export function AiLogsPanel() {
  const [params, setParams] = useQueryStates(aiLogsSearchParams);
  const { scope, teamIdParam } = useAiLogsScope(params);

  // profiles + teams power the scope selector and the per-row profile badge lookup
  const profiles = useQuery(api.profiles.list);
  const teams = useQuery(api.teams.list);

  const teamId =
    scope === "team" && teamIdParam.length > 0
      ? normalizeTeamId(teamIdParam, teams)
      : undefined;

  const listArgs = useMemo(() => {
    if (scope === "team" && !teamId) return "skip" as const;
    return {
      scope,
      teamId,
      profileId: isAllProfilesFilter(params.profileId)
        ? undefined
        : normalizeProfileId(params.profileId, profiles),
      features: params.features.length > 0 ? params.features : undefined,
      models: params.models.length > 0 ? params.models : undefined,
      range: params.range,
    };
  }, [
    scope,
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
    if (scope === "team" && !teamId) return "skip" as const;
    return {
      scope,
      teamId,
      range: params.range,
    };
  }, [scope, teamId, params.range]);

  const summary = useQuery(api.openRouterLogs.summaryMine, summaryArgs);

  const trends = useMemo(
    () => computeAiLogsTrends(paged.results),
    [paged.results],
  );

  const profilesById = useMemo(() => {
    const map = new Map<string, ProfileListItem>();
    for (const profile of profiles ?? []) {
      map.set(profile._id, profile);
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

// right-section actions for the Usage tab — filters dropdown and sort dropdown
export function AiLogsRightSection() {
  const [params, setParams] = useQueryStates(aiLogsSearchParams);
  const { scope, teamIdParam } = useAiLogsScope(params);
  const profiles = useQuery(api.profiles.list);
  const teams = useQuery(api.teams.list);

  const teamId =
    scope === "team" && teamIdParam.length > 0
      ? normalizeTeamId(teamIdParam, teams)
      : undefined;

  const distinctModelsArgs =
    scope === "team" ? (teamId ? { scope, teamId } : "skip") : { scope };
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

  return (
    <div className="flex items-center gap-2">
      <LogsFiltersDropdown
        scope={scope}
        teamId={teamIdParam}
        teams={teams ?? []}
        onScopeChange={(scope, nextTeamId) =>
          setParams({ scope, teamId: nextTeamId ?? "" })
        }
        range={params.range}
        features={params.features}
        models={params.models}
        availableModels={availableModels}
        profileId={params.profileId}
        profiles={profiles}
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

// helpers — match a string to a typed Id by checking against the user's
// known set, so we never push a malformed id to the backend
function normalizeTeamId(
  raw: string,
  teams: TeamListItem[] | undefined,
): Id<"teams"> | undefined {
  if (!teams) return undefined;
  const match = teams.find((t) => t.team._id === raw);
  return match?.team._id;
}

function normalizeProfileId(
  raw: string,
  profiles: ProfileListItem[] | undefined,
): Id<"profiles"> | undefined {
  if (!profiles) return undefined;
  const match = profiles.find((p) => p._id === raw);
  return match?._id;
}
