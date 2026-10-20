import { z } from "zod";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { runDeleteTeam } from "../teams/lifecycle";
import {
  authActionCtx,
  confirmParam,
  emptyInputSchema,
  toolSpec,
  type ToolHandlerContext,
} from "./toolTypes";

// Team tools act on teams the caller belongs to. The handlers keep the web
// owner / membership checks; another team's id reads as "Team not found".

const teamIdParam = z.string().describe("Team id from teams_list");

const teamNameParam = z
  .string()
  .trim()
  .min(1)
  .describe("Team name (also the team profile name)");

const teamsGetSchema = z.object({
  teamId: z
    .string()
    .optional()
    .describe(
      "Team id from teams_list. Defaults to the active team profile on the team connector; required on the personal connector",
    ),
});

const teamsCreateSchema = z.object({ name: teamNameParam });

const teamsRenameSchema = z.object({
  teamId: teamIdParam,
  name: teamNameParam,
});

const teamsLeaveSchema = z.object({ teamId: teamIdParam });

const teamsAddMemberSchema = z.object({
  teamId: teamIdParam,
  email: z
    .string()
    .trim()
    .min(1)
    .describe("Email of an existing vmem account. They join as a member"),
});

const teamsRemoveMemberSchema = z.object({
  teamId: teamIdParam,
  userId: z.string().describe("Member userId from teams_get"),
  confirm: confirmParam,
});

const teamsDeleteSchema = z.object({
  teamId: teamIdParam,
  confirm: confirmParam,
});

function isoDate(ms: number): string {
  return new Date(ms).toISOString();
}

function mapTeam(team: Doc<"teams">) {
  return {
    teamId: team._id,
    name: team.name,
    createdAt: isoDate(team.createdAt),
  };
}

async function defaultTeamId(
  h: ToolHandlerContext,
  teamId: string | undefined,
): Promise<string> {
  if (teamId !== undefined) return teamId;
  if (h.scope !== "team") {
    throw new Error("teamId is required on the personal connector");
  }
  const profile = await h.ctx.runQuery(
    internal.profiles.getActiveProfileForMcpScopeInternal,
    { clerkId: h.clerkUserId, scope: "team" },
  );
  if (!profile?.teamId) {
    throw new Error("No team profiles available. Join or create a team first.");
  }
  return profile.teamId;
}

export const teamsToolSpecs = {
  teams_list: toolSpec({
    name: "teams_list",
    schema: emptyInputSchema,
    description:
      "List the teams you belong to: teamId, name, your role (owner or member), memberCount and the team profileId (use it as profileId on the team connector).",
    errorLabel: "List teams failed",
    async run(h): Promise<unknown> {
      const rows = await h.ctx.runQuery(internal.teams.listByClerkIdInternal, {
        clerkId: h.clerkUserId,
      });
      return rows.map((row) => ({
        ...mapTeam(row.team),
        role: row.role,
        memberCount: row.memberCount,
        profileId: row.profile?._id ?? null,
      }));
    },
  }),
  teams_get: toolSpec({
    name: "teams_get",
    schema: teamsGetSchema,
    description:
      "Get one team you belong to, with its members (userId, email, name, role, joinedAt), as on the web Team page.",
    errorLabel: "Get team failed",
    async run(h, params): Promise<unknown> {
      const result = await h.ctx.runQuery(internal.teams.getByClerkIdInternal, {
        clerkId: h.clerkUserId,
        teamId: await defaultTeamId(h, params.teamId),
      });
      if (result === null) throw new Error("Team not found");
      return {
        ...mapTeam(result.team),
        role: result.role,
        profileId: result.profile?._id ?? null,
        members: result.members.map((member) => ({
          userId: member.userId,
          email: member.email,
          name:
            member.fullName ??
            ([member.firstName, member.lastName].filter(Boolean).join(" ") ||
              null),
          role: member.role,
          joinedAt: isoDate(member.joinedAt),
        })),
      };
    },
  }),
  teams_create: toolSpec({
    name: "teams_create",
    schema: teamsCreateSchema,
    description:
      "Create a team with you as owner. A shared team profile with the same name is created too.",
    errorLabel: "Create team failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(internal.teams.createByClerkIdInternal, {
        clerkId: h.clerkUserId,
        name: params.name,
      });
    },
  }),
  teams_rename: toolSpec({
    name: "teams_rename",
    schema: teamsRenameSchema,
    description: "Rename a team and its team profile. Owner only.",
    errorLabel: "Rename team failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(internal.teams.updateTeamByClerkIdInternal, {
        clerkId: h.clerkUserId,
        teamId: params.teamId,
        name: params.name,
      });
    },
  }),
  teams_leave: toolSpec({
    name: "teams_leave",
    schema: teamsLeaveSchema,
    description:
      "Leave a team. The last owner cannot leave; delete the team instead.",
    errorLabel: "Leave team failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(internal.teams.leaveTeamByClerkIdInternal, {
        clerkId: h.clerkUserId,
        teamId: params.teamId,
      });
    },
  }),
  teams_add_member: toolSpec({
    name: "teams_add_member",
    schema: teamsAddMemberSchema,
    description:
      "Add an existing vmem user to a team by email, with the member role. Owner only.",
    errorLabel: "Add team member failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(internal.teams.addMemberByClerkIdInternal, {
        clerkId: h.clerkUserId,
        teamId: params.teamId,
        email: params.email,
      });
    },
  }),
  teams_remove_member: toolSpec({
    name: "teams_remove_member",
    schema: teamsRemoveMemberSchema,
    description:
      "Remove a member from a team (they lose access to its memories, skills and files). Owner only; the last owner cannot be removed. Requires confirm: true.",
    errorLabel: "Remove team member failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(internal.teams.removeMemberByClerkIdInternal, {
        clerkId: h.clerkUserId,
        teamId: params.teamId,
        userId: params.userId,
      });
    },
  }),
  teams_delete: toolSpec({
    name: "teams_delete",
    schema: teamsDeleteSchema,
    description:
      "Permanently delete a team, its team profile and every team memory. Owner only. Requires confirm: true.",
    errorLabel: "Delete team failed",
    async run(h, params): Promise<unknown> {
      return runDeleteTeam(await authActionCtx(h), { teamId: params.teamId });
    },
  }),
};
