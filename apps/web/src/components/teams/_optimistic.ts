import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "@vmem/backend";
import { optimisticId } from "@/lib/optimisticId";

type UpdateTeamArgs = FunctionArgs<typeof api.teams.updateTeam>;
type RemoveMemberArgs = FunctionArgs<typeof api.teams.removeMember>;
type AddMemberArgs = FunctionArgs<typeof api.teams.addMember>;
type CreateTeamArgs = FunctionArgs<typeof api.teams.create>;

export function optimisticallyUpdateTeam(
  localStore: OptimisticLocalStore,
  args: UpdateTeamArgs,
): void {
  const now = Date.now();
  const list = localStore.getQuery(api.teams.list, {});
  if (list) {
    localStore.setQuery(
      api.teams.list,
      {},
      list.map((entry) =>
        entry.team._id === args.teamId
          ? {
              ...entry,
              team: {
                ...entry.team,
                name: args.name,
                updatedAt: now,
              },
              profile:
                entry.profile !== null
                  ? {
                      ...entry.profile,
                      name: args.name,
                      updatedAt: now,
                    }
                  : null,
            }
          : entry,
      ),
    );
  }
  const detail = localStore.getQuery(api.teams.get, { teamId: args.teamId });
  if (detail) {
    localStore.setQuery(
      api.teams.get,
      { teamId: args.teamId },
      {
        ...detail,
        team: { ...detail.team, name: args.name, updatedAt: now },
        profile:
          detail.profile !== null
            ? {
                ...detail.profile,
                name: args.name,
                updatedAt: now,
              }
            : null,
      },
    );
  }
}

export function optimisticallyRemoveMember(
  localStore: OptimisticLocalStore,
  args: RemoveMemberArgs,
): void {
  const detail = localStore.getQuery(api.teams.get, { teamId: args.teamId });
  if (detail) {
    localStore.setQuery(
      api.teams.get,
      { teamId: args.teamId },
      {
        ...detail,
        members: detail.members.filter((m) => m.userId !== args.userId),
      },
    );
  }
  const list = localStore.getQuery(api.teams.list, {});
  if (list) {
    localStore.setQuery(
      api.teams.list,
      {},
      list.map((entry) =>
        entry.team._id === args.teamId
          ? { ...entry, memberCount: Math.max(0, entry.memberCount - 1) }
          : entry,
      ),
    );
  }
}

export function optimisticallyAddMember(
  localStore: OptimisticLocalStore,
  args: AddMemberArgs,
): void {
  const detail = localStore.getQuery(api.teams.get, { teamId: args.teamId });
  if (detail) {
    const now = Date.now();
    const tempUserId = optimisticId("users");
    localStore.setQuery(
      api.teams.get,
      { teamId: args.teamId },
      {
        ...detail,
        members: [
          ...detail.members,
          {
            userId: tempUserId,
            role: "member",
            joinedAt: now,
            email: args.email.trim().toLowerCase(),
            fullName: null,
            firstName: null,
            lastName: null,
          },
        ],
      },
    );
  }
  const list = localStore.getQuery(api.teams.list, {});
  if (list) {
    localStore.setQuery(
      api.teams.list,
      {},
      list.map((entry) =>
        entry.team._id === args.teamId
          ? { ...entry, memberCount: entry.memberCount + 1 }
          : entry,
      ),
    );
  }
}

export function optimisticallyCreateTeam(
  localStore: OptimisticLocalStore,
  args: CreateTeamArgs,
): void {
  const list = localStore.getQuery(api.teams.list, {});
  if (!list) return;
  const head = list.at(0);
  if (!head) return;
  const now = Date.now();
  const teamId = optimisticId("teams");
  const profileId = optimisticId("profiles");
  localStore.setQuery(api.teams.list, {}, [
    {
      team: {
        _id: teamId,
        _creationTime: now,
        name: args.name.trim(),
        createdBy: head.team.createdBy,
        createdAt: now,
        updatedAt: now,
      },
      role: "owner",
      profile: {
        _id: profileId,
        _creationTime: now,
        userId: head.team.createdBy,
        name: args.name.trim(),
        color: "#8B5CF6",
        icon: "briefcase",
        isDefault: false,
        teamId,
        createdAt: now,
        updatedAt: now,
      },
      memberCount: 1,
    },
    ...list,
  ]);
}
