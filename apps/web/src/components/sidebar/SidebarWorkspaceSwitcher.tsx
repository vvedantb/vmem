import { useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import { tempId } from "@/lib/convex-optimistic";
import {
  Button,
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
import { ProfileAvatar } from "@/components/profiles/ProfileAvatar";
import { CreateEditProfileDialog } from "@/components/profiles/CreateEditProfileDialog";
import { CreateTeamDialog } from "@/components/teams/CreateTeamDialog";
import {
  useActiveProfileId,
  useLastActiveProfileId,
} from "@/components/workspace/active-profile";
import { workspacePathFor } from "@/components/workspace/workspace-paths";
import { SidebarIconTooltip } from "./SidebarIconTooltip";

function WorkspaceRow({
  profile,
  activeId,
  onSelect,
}: {
  profile: Doc<"profiles">;
  activeId: string;
  onSelect: (profile: Doc<"profiles">) => void;
}) {
  return (
    <DropdownMenuItem onSelect={() => onSelect(profile)}>
      <ProfileAvatar
        icon={profile.icon}
        color={profile.color}
        className="h-5 w-5"
      />
      <span className="min-w-0 flex-1 truncate">{profile.name}</span>
      {profile._id === activeId ? (
        <IconCheck className="h-4 w-4 shrink-0 text-muted" />
      ) : null}
    </DropdownMenuItem>
  );
}

function partitionProfiles(profiles: Doc<"profiles">[]): {
  personal: Doc<"profiles">[];
  team: Doc<"profiles">[];
} {
  const personal: Doc<"profiles">[] = [];
  const team: Doc<"profiles">[] = [];
  for (const profile of profiles) {
    if (profile.teamId === undefined) personal.push(profile);
    else team.push(profile);
  }
  return { personal, team };
}

// workspace (profile) switcher at the top of the sidebar
export function SidebarWorkspaceSwitcher({
  collapsed,
  onNavigate,
}: {
  // collapsed (icon-only) rail shows just the avatar; dropdown opens to the side
  collapsed: boolean;
  // called after any navigation (mobile menu close)
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeProfileId = useActiveProfileId();
  const [, setLastProfileId] = useLastActiveProfileId();
  const profiles = useQuery(api.profiles.list);
  const createProfile = useMutation(api.profiles.create).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.profiles.list, {});
      if (list === undefined) return;
      const now = Date.now();
      const optimisticId = tempId<"profiles">();
      localStore.setQuery(api.profiles.list, {}, [
        ...list,
        {
          _id: optimisticId,
          _creationTime: now,
          userId: list[0]?.userId ?? tempId<"users">(),
          name: args.name,
          color: args.color,
          icon: args.icon,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    },
  );
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

  const { personal: personalProfiles, team: teamProfiles } =
    partitionProfiles(profiles);
  const subtitle = active.teamId !== undefined ? "Team workspace" : "Personal";

  const switchTo = (profile: Doc<"profiles">) => {
    setLastProfileId(profile._id);
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
      setLastProfileId(created._id);
      await navigate({
        to: "/$profileId/home",
        params: { profileId: created._id },
      });
      onNavigate?.();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {collapsed ? (
            <SidebarIconTooltip label={active.name} enabled>
              <Button
                type="button"
                variant="ghost"
                className="mx-auto h-auto rounded-lg p-1 hover:bg-surface-tertiary/50 active:scale-100"
              >
                <ProfileAvatar
                  icon={active.icon}
                  color={active.color}
                  className="h-7 w-7"
                />
              </Button>
            </SidebarIconTooltip>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start gap-2.5 rounded-lg bg-surface-secondary p-2 text-left hover:bg-surface-tertiary active:scale-100"
            >
              <ProfileAvatar
                icon={active.icon}
                color={active.color}
                className="h-7 w-7"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight text-foreground">
                  {active.name}
                </p>
                <p className="truncate text-xs leading-tight text-muted">
                  {subtitle}
                </p>
              </div>
              <IconSelector className="h-4 w-4 shrink-0 text-muted" />
            </Button>
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
          {personalProfiles.map((profile) => (
            <WorkspaceRow
              key={profile._id}
              profile={profile}
              activeId={active._id}
              onSelect={switchTo}
            />
          ))}
          {teamProfiles.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted">
                Teams
              </DropdownMenuLabel>
              {teamProfiles.map((profile) => (
                <WorkspaceRow
                  key={profile._id}
                  profile={profile}
                  activeId={active._id}
                  onSelect={switchTo}
                />
              ))}
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
