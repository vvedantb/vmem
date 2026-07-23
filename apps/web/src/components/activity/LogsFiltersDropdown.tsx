import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@vmem/ui";
import {
  IconCalendar,
  IconCalendarMonth,
  IconCalendarWeek,
  IconCheck,
  IconCpu,
  IconDatabase,
  IconDeviceFloppy,
  IconFilter,
  IconInfinity,
  IconListDetails,
  IconMessage,
  IconMoon,
  IconPlug,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconSun,
  IconUser,
  IconUsers,
  IconUsersGroup,
  IconVectorBezier,
  IconWand,
  IconX,
} from "@tabler/icons-react";
import {
  FEATURES,
  FEATURE_LABELS,
  PROFILE_FILTER_ALL,
  RANGE_LABELS,
  isAllProfilesFilter,
  type Feature,
  type Range,
  type Scope,
} from "@/lib/url-state/activity";
import type { ProfileListItem, TeamListItem } from "./types";
import {
  FacetedFilterBadge,
  FacetedFilterOption,
  toggleArrayItem,
} from "@/components/_components/FacetedFilter";

// filters dropdown for `/activity/usage`
const RANGE_OPTIONS: Range[] = ["today", "7d", "30d", "all"];

const RANGE_ICONS: Record<Range, typeof IconSun> = {
  today: IconSun,
  "7d": IconCalendarWeek,
  "30d": IconCalendarMonth,
  all: IconInfinity,
};

const FEATURE_ICONS: Record<Feature, typeof IconSparkles> = {
  enrichment: IconSparkles,
  "dream-synthesis": IconMoon,
  "context-prompt": IconMessage,
  "fact-extraction": IconListDetails,
  "entity-backfill": IconDatabase,
  "memory-save": IconDeviceFloppy,
  "memory-search": IconSearch,
  "mcp-embed": IconPlug,
  "connector-sync": IconRefresh,
  "dream-materialize": IconWand,
  "proposal-accept": IconCheck,
  "embedding-backfill": IconVectorBezier,
};

interface LogsFiltersDropdownProps {
  scope: Scope;
  teamId: string;
  teams: readonly TeamListItem[];
  onScopeChange: (scope: Scope, teamId: string | null) => void;
  range: Range;
  features: readonly Feature[];
  models: readonly string[];
  availableModels: readonly string[];
  profileId: string;
  profiles: readonly ProfileListItem[] | undefined;
  onRangeChange: (range: Range) => void;
  onFeaturesChange: (features: Feature[]) => void;
  onModelsChange: (models: string[]) => void;
  onProfileChange: (profileId: string) => void;
  onReset: () => void;
}

export function LogsFiltersDropdown({
  scope,
  teamId,
  teams,
  onScopeChange,
  range,
  features,
  models,
  availableModels,
  profileId,
  profiles,
  onRangeChange,
  onFeaturesChange,
  onModelsChange,
  onProfileChange,
  onReset,
}: LogsFiltersDropdownProps) {
  const activeFilterCount =
    (range !== "7d" ? 1 : 0) +
    (features.length > 0 ? 1 : 0) +
    (models.length > 0 ? 1 : 0) +
    (!isAllProfilesFilter(profileId) ? 1 : 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-2">
          <IconFilter size={16} />
          Filters
          <FacetedFilterBadge count={activeFilterCount} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {teams.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconUsersGroup size={16} />
              Scope
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={scope === "team" ? `team:${teamId}` : "personal"}
                onValueChange={(value) => {
                  if (value === "personal") onScopeChange("personal", null);
                  else if (value.startsWith("team:")) {
                    onScopeChange("team", value.slice("team:".length));
                  }
                }}
              >
                <DropdownMenuRadioItem value="personal">
                  <FacetedFilterOption icon={<IconUser size={16} />}>
                    Personal
                  </FacetedFilterOption>
                </DropdownMenuRadioItem>
                {teams.map((t) => (
                  <DropdownMenuRadioItem
                    key={t.team._id}
                    value={`team:${t.team._id}`}
                  >
                    <FacetedFilterOption icon={<IconUsers size={16} />}>
                      {t.team.name}
                    </FacetedFilterOption>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconCalendar size={16} />
            Date range
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={range}
              onValueChange={(value) => {
                const next = RANGE_OPTIONS.find((r) => r === value);
                if (next) onRangeChange(next);
              }}
            >
              {RANGE_OPTIONS.map((preset) => {
                const RangeIcon = RANGE_ICONS[preset];
                return (
                  <DropdownMenuRadioItem key={preset} value={preset}>
                    <FacetedFilterOption icon={<RangeIcon size={16} />}>
                      {RANGE_LABELS[preset]}
                    </FacetedFilterOption>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconSparkles size={16} />
            Features
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
            {FEATURES.map((feat) => {
              const FeatureIcon = FEATURE_ICONS[feat];
              return (
                <DropdownMenuCheckboxItem
                  key={feat}
                  checked={features.includes(feat)}
                  onCheckedChange={() =>
                    onFeaturesChange(toggleArrayItem(features, feat))
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  <FacetedFilterOption icon={<FeatureIcon size={16} />}>
                    {FEATURE_LABELS[feat]}
                  </FacetedFilterOption>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {availableModels.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconCpu size={16} />
              Models
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
              {availableModels.map((model) => (
                <DropdownMenuCheckboxItem
                  key={model}
                  checked={models.includes(model)}
                  onCheckedChange={() =>
                    onModelsChange(toggleArrayItem(models, model))
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  <FacetedFilterOption icon={<IconCpu size={16} />}>
                    <span className="truncate font-mono text-xs">{model}</span>
                  </FacetedFilterOption>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconUser size={16} />
            Profile
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={
                isAllProfilesFilter(profileId) ? PROFILE_FILTER_ALL : profileId
              }
              onValueChange={(value) => onProfileChange(value)}
            >
              <DropdownMenuRadioItem value={PROFILE_FILTER_ALL}>
                <FacetedFilterOption icon={<IconUsersGroup size={16} />}>
                  All
                </FacetedFilterOption>
              </DropdownMenuRadioItem>
              {(profiles ?? []).map((p) => (
                <DropdownMenuRadioItem key={p._id} value={p._id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: p.color ?? "var(--muted)",
                      }}
                    />
                    {p.name}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {activeFilterCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onReset}
              className="text-danger focus:text-danger"
            >
              <IconX size={16} />
              Reset filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
