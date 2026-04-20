"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from "@vmem/ui";
import { IconUser, IconUsers } from "@tabler/icons-react";
import { api } from "@vmem/backend";

interface ProfileFilterProps {
  selectedProfileId: string | null;
  onProfileChange: (id: string | null) => void;
  /** Total item count when "All Profiles" is selected */
  itemCount?: number;
}

/**
 * Popover profile filter for list and graph views — lets users narrow to a
 * specific profile or show all profiles (default).
 */
export default function ProfileFilter({
  selectedProfileId,
  onProfileChange,
  itemCount,
}: ProfileFilterProps) {
  const [open, setOpen] = useState(false);
  const profiles = useQuery(api.profiles.list);

  const selectedProfile = profiles?.find((p) => p._id === selectedProfileId);
  const isFiltered = selectedProfileId !== null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-12 shrink-0 gap-1.5 px-3",
            isFiltered && "border-primary text-primary",
          )}
        >
          {selectedProfile ? (
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: selectedProfile.color }}
            />
          ) : (
            <IconUser size={18} stroke={1.5} />
          )}
          {selectedProfile ? selectedProfile.name : "Profile"}
          {isFiltered && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-medium tabular-nums">
              1
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 flex flex-col">
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onProfileChange(null);
              setOpen(false);
            }}
            className={cn(
              "justify-start gap-2 h-9 px-2 font-normal",
              !isFiltered && "bg-accent text-accent-foreground font-medium",
            )}
          >
            <IconUsers size={16} stroke={1.5} />
            <span className="truncate">All Profiles</span>
            {itemCount !== undefined && (
              <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums">
                {itemCount}
              </span>
            )}
          </Button>
          <span className="text-xs text-muted-foreground px-1">Profiles</span>
        </div>
        <div className="flex flex-col max-h-64 overflow-y-auto">
          {profiles === undefined ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : profiles.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">
              No profiles found
            </div>
          ) : (
            profiles.map((profile) => {
              const isSelected = selectedProfileId === profile._id;
              return (
                <button
                  key={profile._id}
                  type="button"
                  onClick={() => {
                    onProfileChange(profile._id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-9 cursor-pointer items-center gap-2 border-b border-border/40 px-3 last:border-0 transition-colors",
                    isSelected
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/50",
                  )}
                >
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: profile.color }}
                  />
                  <span className="flex min-w-0 flex-1 items-center text-xs font-normal">
                    <span className="truncate">{profile.name}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
