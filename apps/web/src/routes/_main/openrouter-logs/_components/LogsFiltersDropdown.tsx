"use client";

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
import { IconFilter, IconX } from "@tabler/icons-react";
import {
  FEATURES,
  FEATURE_LABELS,
  RANGE_LABELS,
  type Feature,
  type Range,
  type StatusFilter,
} from "../-searchParams";

/**
 * Filters dropdown for `/openrouter-logs`.
 *
 * Per CLAUDE.md, the page consolidates real filters (range, status, features,
 * models, profile) into a single dropdown with a count badge. Sort and the
 * scope selector live as their own controls — they don't change *which* rows
 * appear, only the population (scope) or order (sort).
 *
 * Active count = number of filter fields currently non-default. Multi-value
 * arrays count as 1 if non-empty, not their length, so toggling several
 * features on doesn't inflate the badge.
 */
const RANGE_OPTIONS: Range[] = ["today", "7d", "30d", "all"];

interface LogsFiltersDropdownProps {
  range: Range;
  status: StatusFilter;
  features: readonly Feature[];
  models: readonly string[];
  availableModels: readonly string[];
  profileId: string;
  profiles:
    | readonly {
        _id: string;
        name: string;
        color?: string | null | undefined;
      }[]
    | undefined;
  onRangeChange: (range: Range) => void;
  onStatusChange: (status: StatusFilter) => void;
  onFeaturesChange: (features: Feature[]) => void;
  onModelsChange: (models: string[]) => void;
  onProfileChange: (profileId: string) => void;
  onReset: () => void;
}

export function LogsFiltersDropdown({
  range,
  status,
  features,
  models,
  availableModels,
  profileId,
  profiles,
  onRangeChange,
  onStatusChange,
  onFeaturesChange,
  onModelsChange,
  onProfileChange,
  onReset,
}: LogsFiltersDropdownProps) {
  const activeFilterCount =
    (range !== "7d" ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (features.length > 0 ? 1 : 0) +
    (models.length > 0 ? 1 : 0) +
    (profileId.length > 0 ? 1 : 0);

  const toggleFeature = (feat: Feature) => {
    if (features.includes(feat)) {
      onFeaturesChange(features.filter((f) => f !== feat));
    } else {
      onFeaturesChange([...features, feat]);
    }
  };

  const toggleModel = (model: string) => {
    if (models.includes(model)) {
      onModelsChange(models.filter((m) => m !== model));
    } else {
      onModelsChange([...models, model]);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-2">
          <IconFilter size={16} />
          Filters
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none tabular-nums text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Date range</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={range}
              onValueChange={(value) => {
                const next = RANGE_OPTIONS.find((r) => r === value);
                if (next) onRangeChange(next);
              }}
            >
              {RANGE_OPTIONS.map((preset) => (
                <DropdownMenuRadioItem key={preset} value={preset}>
                  {RANGE_LABELS[preset]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={status}
              onValueChange={(value) => {
                if (
                  value === "all" ||
                  value === "success" ||
                  value === "error"
                ) {
                  onStatusChange(value);
                }
              }}
            >
              <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="success">
                Success only
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="error">
                Errors only
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Features</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
            {FEATURES.map((feat) => (
              <DropdownMenuCheckboxItem
                key={feat}
                checked={features.includes(feat)}
                onCheckedChange={() => toggleFeature(feat)}
                onSelect={(e) => e.preventDefault()}
              >
                {FEATURE_LABELS[feat]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {availableModels.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Models</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
              {availableModels.map((model) => (
                <DropdownMenuCheckboxItem
                  key={model}
                  checked={models.includes(model)}
                  onCheckedChange={() => toggleModel(model)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="truncate font-mono text-xs">{model}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {profiles && profiles.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Profile</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={profileId}
                onValueChange={(value) => onProfileChange(value)}
              >
                <DropdownMenuRadioItem value="">
                  All profiles
                </DropdownMenuRadioItem>
                {profiles.map((p) => (
                  <DropdownMenuRadioItem key={p._id} value={p._id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: p.color ?? "var(--muted-foreground)",
                        }}
                      />
                      {p.name}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {activeFilterCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onReset}
              className="text-destructive focus:text-destructive"
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
