"use client";

import { useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Skeleton,
  cn,
} from "@vmem/ui";
import {
  IconCheck,
  IconPlus,
  IconSelector,
  IconUserCog,
  IconUsers,
} from "@tabler/icons-react";
import { getProfileIcon } from "@/components/profiles/profile-icon";
import { CreateEditProfileDialog } from "@/components/profiles/CreateEditProfileDialog";
import { CreateTeamDialog } from "@/components/teams/CreateTeamDialog";
import {
  rememberActiveProfileId,
  useActiveProfileId,
} from "@/components/workspace/active-profile";
import { workspacePathFor } from "@/components/workspace/workspace-paths";
import { SidebarIconTooltip } from "./SidebarIconTooltip";

function WorkspaceAvatar({
  profile,
  className,
}: {
  profile: Doc<"profiles">;
  className?: string;
}) {
  const Icon = getProfileIcon(profile.icon);
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        className,
      )}
      style={{ backgroundColor: profile.color + "20" }}
    >
      <Icon className="h-4 w-4" style={{ color: profile.color }} />
    </div>
  );
}

/**
 * Workspace (profile) switcher at the top of the sidebar — a structural
 * twin of the account card (`SidebarUserMenu`). Selecting a workspace
 * navigates to the same sub-route in the target workspace (detail ids
 * dropped); the dropdown also hosts create-profile / create-team and a
 * link to profile management.
 */
export function SidebarWorkspaceSwitcher({
  collapsed,
  onNavigate,
}: {
  /** Collapsed (icon-only) rail shows just the avatar; dropdown opens to the side. */
  collapsed: boolean;
  /** Called after any navigation (mobile menu close). */
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeProfileId = useActiveProfileId();
  const profiles = useQuery(api.profiles.list);
  const createProfile = useMutation(api.profiles.create);
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);

  if (profiles === undefined) {
    return collapsed ? (
      <Skeleton className="mx-auto h-9 w-9 rounded-lg" />
    ) : (
      <Skeleton className="h-11 w-full rounded-lg" />
    );
  }

  const active =
    profiles.find((p) => p._id === activeProfileId) ??
    profiles.find((p) => p.isDefault) ??
    profiles[0];
  if (active === undefined) return null;

  const personalProfiles = profiles.filter((p) => p.teamId === undefined);
  const teamProfiles = profiles.filter((p) => p.teamId !== undefined);
  const subtitle = active.teamId !== undefined ? "Team workspace" : "Personal";

  const switchTo = (profile: Doc<"profiles">) => {
    rememberActiveProfileId(profile._id);
    void navigate({
      to: workspacePathFor(pathname, profile._id, profile.teamId !== undefined),
    });
    onNavigate?.();
  };

  const handleCreateProfile = async (data: {
    name: string;
    color: string;
    icon: string;
  }) => {
    const created = await createProfile(data);
    if (created) {
      rememberActiveProfileId(created._id);
      await navigate({
        to: "/$profileId/home",
        params: { profileId: created._id },
      });
      onNavigate?.();
    }
  };

  const workspaceRow = (profile: Doc<"profiles">) => (
    <DropdownMenuItem key={profile._id} onSelect={() => switchTo(profile)}>
      <WorkspaceAvatar profile={profile} className="h-5 w-5" />
      <span className="min-w-0 flex-1 truncate">{profile.name}</span>
      {profile._id === active._id ? (
        <IconCheck className="h-4 w-4 shrink-0 text-muted" />
      ) : null}
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {collapsed ? (
            <SidebarIconTooltip label={active.name} enabled>
              <button
                type="button"
                className="mx-auto flex items-center justify-center rounded-lg p-1 transition-[background-color] hover:bg-surface-tertiary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <WorkspaceAvatar profile={active} />
              </button>
            </SidebarIconTooltip>
          ) : (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg bg-surface-secondary p-2 text-left transition-[background-color] hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <WorkspaceAvatar profile={active} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight text-foreground">
                  {active.name}
                </p>
                <p className="truncate text-xs leading-tight text-muted">
                  {subtitle}
                </p>
              </div>
              <IconSelector className="h-4 w-4 shrink-0 text-muted" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={collapsed ? "center" : "start"}
          side={collapsed ? "right" : "bottom"}
          sideOffset={collapsed ? 8 : 6}
          className={cn(
            collapsed
              ? "w-56"
              : "w-[var(--radix-dropdown-menu-trigger-width)] min-w-56",
          )}
        >
          {personalProfiles.length > 0 ? (
            <DropdownMenuLabel className="text-xs text-muted">
              Personal
            </DropdownMenuLabel>
          ) : null}
          {personalProfiles.map(workspaceRow)}
          {teamProfiles.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted">
                Teams
              </DropdownMenuLabel>
              {teamProfiles.map(workspaceRow)}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateProfileOpen(true)}>
            <IconPlus />
            Create profile
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreateTeamOpen(true)}>
            <IconUsers />
            Create team
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings/profiles" onClick={() => onNavigate?.()}>
              <IconUserCog />
              Manage profiles
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateEditProfileDialog
        profile={null}
        open={createProfileOpen}
        onOpenChange={setCreateProfileOpen}
        onSave={handleCreateProfile}
      />
      <CreateTeamDialog
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
      />
    </>
  );
}
