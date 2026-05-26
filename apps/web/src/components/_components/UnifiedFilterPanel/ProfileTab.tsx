"use client";

import { useQuery } from "convex/react";
import { cn, Skeleton, TabsPrimitive } from "@vmem/ui";
import { IconUsers } from "@tabler/icons-react";
import { api } from "@vmem/backend";

interface ProfileTabProps {
  selectedProfileId: string | null;
  onProfileChange: (id: string | null) => void;
  totalCount: number;
}

export default function ProfileTab({
  selectedProfileId,
  onProfileChange,
  totalCount,
}: ProfileTabProps) {
  const profiles = useQuery(api.profiles.list);

  return (
    <TabsPrimitive.Content
      value="profile"
      className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
    >
      <div className="p-2 border-b border-border">
        <button
          type="button"
          onClick={() => onProfileChange(null)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
            !selectedProfileId
              ? "bg-surface-tertiary text-accent-foreground font-medium"
              : "hover:bg-surface-secondary/50",
          )}
        >
          <IconUsers size={14} />
          All Profiles
          <span className="ml-auto text-muted/50 tabular-nums">
            {totalCount}
          </span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto max-h-64">
        {profiles === undefined ? (
          <div className="p-2 space-y-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="p-3 text-xs text-muted text-center">
            No profiles found
          </div>
        ) : (
          profiles.map((profile) => {
            const isSelected = selectedProfileId === profile._id;
            return (
              <button
                key={profile._id}
                type="button"
                onClick={() => onProfileChange(profile._id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors border-b border-border/40 last:border-0",
                  isSelected
                    ? "bg-surface-tertiary text-accent-foreground"
                    : "hover:bg-surface-secondary/50",
                )}
              >
                <div
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: profile.color }}
                />
                <span className="truncate">{profile.name}</span>
              </button>
            );
          })
        )}
      </div>
    </TabsPrimitive.Content>
  );
}
