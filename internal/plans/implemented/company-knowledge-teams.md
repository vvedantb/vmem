# Company Knowledge (Teams)

## Context

Today profiles are 1:user, memories 1:creator. User wants multi-user shared workspace: create a team, add teammates by email, everyone saves to a shared team profile, and a new **Company Knowledge** tab surfaces all team memories with attribution.

Confirmed decisions:

- One shared team profile per team (not per member).
- Add teammate by email — if user exists → added instantly. No pending-invite system, no email sending.
- Roles: `owner` + `member`.
- Team memory edit/delete: creator OR team owner.
- Multi-team: user can be in many teams.
- Leaving: memories stay with team (attribution preserved).
- New `/teams` + `/teams/$teamId` route with team dashboard + memory list with "Saved by" column.

## Schema changes — `packages/backend/convex/schema.ts` + `validators.ts`

**New `teamFields` in `validators.ts`:**

```
{ name: string, createdBy: Id<"users">, createdAt: number, updatedAt: number }
```

Table `teams` indexed `by_createdBy`.

**New `teamMemberFields` in `validators.ts`:**

```
{ teamId: Id<"teams">, userId: Id<"users">, role: "owner"|"member", joinedAt: number }
```

Table `teamMembers` indexed `by_team`, `by_user`, `by_team_user` (uniqueness), `by_user_team`.

**Extend `profileFields`:** add `teamId: v.optional(v.id("teams"))`.

- Personal profile: `teamId` undefined.
- Team profile: `teamId` set, `userId` = team creator, `isDefault` always false.
- Add index `by_team` on profiles (1 team profile per team).

## Backend — new file `packages/backend/convex/teams.ts`

Mirrors `profiles.ts` style. Exports:

- `list` (authQuery): teams where current user has membership. Join via `teamMembers.by_user` → `teams.get`.
- `get` (authQuery): single team; throws if user not a member. Returns `{ team, role, profile }`.
- `create` (authMutation): name → insert team + insert self as `owner` member + insert team profile (name = team name, color/icon from preset). Return `{ teamId, profileId }`.
- `addMember` (authMutation): args `teamId, email`. Require caller is `owner`. Lookup user by `users.by_email`. If not found → throw `"No vmem account for that email"`. If already member → throw. Insert `teamMembers` row with role `member`.
- `removeMember` (authMutation): owner-only; cannot remove last owner. Memories stay (do nothing to Neo4j).
- `leaveTeam` (authMutation): self-remove; owner cannot leave unless another owner exists.
- `updateTeam` (authMutation): owner-only rename.
- `deleteTeam` (authMutation): owner-only. Deletes `teamMembers` rows, deletes team profile (via existing `removeWithMemories` pattern → Neo4j purge of team's memories), deletes team.

**Internal helpers in same file:**

- `requireTeamRole(ctx, teamId, roles)` — throws if caller lacks role.
- `getTeamMemberUserIds(ctx, teamId)` — returns `Id<"users">[]`.
- `getTeamMemberClerkIds(ctx, teamId)` — returns `string[]` (needed for Neo4j filter).
- `assertTeamProfileAccess(ctx, profileId)` — resolves profile; if `teamId` set, verify caller in `teamMembers`. Reused by memory layer.

## Profile access changes — `packages/backend/convex/profiles.ts`

- `list` authQuery: union personal profiles (`by_user`) + team profiles via `teamMembers.by_user` → fetch each profile by `team.by_team`.
- `get`: allow if `profile.userId === ctx.userId` OR profile is a team profile and caller is in `teamMembers`.
- `update`/`remove`: for team profile, require `owner` role.
- `getOrCreateDefault` untouched (always personal).
- New internal: `getTeamProfileForTeamInternal(teamId)`.

## Memory access changes

**Convex layer — `packages/backend/convex/memoryApi.ts`:**

- Every action taking a `profileId` (createMemory, listMemories additions, etc.) calls `assertTeamProfileAccess`.
- For read paths on team profile, resolve allowed clerkIds via `getTeamMemberClerkIds` and pass array into Neo4j internal action.
- For write paths (create) on team profile, allow if caller is a member; creator clerkId is caller's own clerkId (for attribution).
- For update/delete: require `clerkId === memory.userId` OR caller is owner of the memory's team (look up team via profile).

**Neo4j internal actions — `packages/backend/convex/neo4jActions/memories.ts` + `src/neo4j/memoryService.ts`:**

- Replace single `userId` arg with discriminated union:
  ```
  scope: { kind: "personal", userId: string }
       | { kind: "team", allowedUserIds: string[], profileId: string }
  ```
- Update every Cypher that currently has `WHERE m.userId = $userId` to branch:
  - personal: unchanged.
  - team: `WHERE m.userId IN $allowedUserIds AND m.profileId = $profileId`.
- Functions touched (line refs from exploration): `getMemory` (426), `listMemories` (445), `searchMemories` (634), `getGraphData` (1233), plus migrations (1538+).
- Keep existing personal entry points; add a thin overload that resolves scope before calling the underlying method.

**Add `listMemories` profileId param** — currently not accepted. Needed so team view can filter. Already supported at Neo4j level (see `listMemories` params `profileId?`), just need to wire through Convex action args.

## Memory list — show creator attribution

- `MemoryWithTags` already has `userId` (clerkId). Add an authQuery `users.getByClerkIdsInternal(clerkIds: string[])` returning `Record<string, {firstName, lastName, email}>`.
- Team memory list client calls this once with unique clerkIds from visible memories → renders "Saved by X" badge.

## Frontend — web app (Vite + TanStack Router)

**Sidebar — `apps/web/src/components/sidebar/nav-config.ts`:**

- New nav group `"Teams"` with `IconBuilding` (or `IconUsersGroup`), one item `{ href: "/teams", label: "Teams", icon: IconBuilding }`. Insert between Workspace and Data.

**Profile dropdown — `apps/web/src/components/ProfileDropdown.tsx`:**

- `api.profiles.list` already returns team profiles after backend change. Add visual marker (small "Team" pill or team icon) on team profile rows. Group: "Personal" / "Teams".

**New routes (TanStack file-based):**

`apps/web/src/routes/_main/teams/index.tsx` — list + create.

- Uses `api.teams.list`. Shows card grid: each team card links to `/teams/$teamId`, plus "Create team" button → dialog (name input, calls `api.teams.create`).
- Empty state: "You're not in any teams. Create one or ask a teammate to add you."

`apps/web/src/routes/_main/teams/$teamId/index.tsx` — thin orchestrator Client component per CLAUDE.md.

- Fetch `api.teams.get({ teamId })`. Tabs: **Overview**, **Knowledge**, **Members**, **Settings**(owner-only).
- Overview: stat cards (total memories in team profile, memories this week, active contributors, member count). Recent activity list.
- Knowledge: memory list filtered to team profile with "Saved by" column. Reuses `MemorySearch`-style filtering; new column when `profile.teamId` set.
- Members: list from `api.teams.get`; owner sees "Add member" (email input) + "Remove" per row; non-owners read-only.
- Settings: rename team, delete team (owner-only, double-confirm).

Subcomponents under `apps/web/src/routes/_main/teams/$teamId/_components/`:

- `TeamOverview.tsx`, `TeamKnowledge.tsx`, `TeamMembers.tsx`, `TeamSettings.tsx`, `AddMemberDialog.tsx`, `CreateTeamDialog.tsx`.

`apps/web/src/routes/_main/teams/$teamId/-searchParams.ts` — nuqs params for tab + memory filters (tags, search, sort).

**Memory creation form:** when active profile is a team profile, dropdown shows "Saving to Evalucom (team)". No other change.

## Critical files

- `packages/backend/convex/schema.ts`
- `packages/backend/convex/validators.ts`
- `packages/backend/convex/teams.ts` _(new)_
- `packages/backend/convex/profiles.ts`
- `packages/backend/convex/memoryApi.ts`
- `packages/backend/convex/neo4jActions/memories.ts`
- `packages/backend/src/neo4j/memoryService.ts`
- `apps/web/src/components/sidebar/nav-config.ts`
- `apps/web/src/components/ProfileDropdown.tsx`
- `apps/web/src/routes/_main/teams/...` _(new folder)_

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — passes.
2. Create two Clerk accounts A (owner) + B (member). Log in as A → create team "Evalucom" → verify new profile appears in dropdown. Open `/teams/<id>` → add B by email → B refreshes → sees Evalucom in their profile dropdown + in `/teams`.
3. As A, save a memory while Evalucom profile active → confirm `memory.userId = A.clerkId`, `profileId = teamProfileId` in Neo4j.
4. As B, load `/teams/<id>` Knowledge tab → sees A's memory with "Saved by A" chip. Save own memory as B → visible to A.
5. As B (member), try to delete A's memory → blocked. As A (owner), delete B's memory → succeeds.
6. As B, leave team → A still sees B's memory with "Saved by B" preserved.
7. Personal profile flows unchanged: dashboard stats still user-wide, personal memory list not polluted by team memories.

## Open questions

None — decisions locked via interview. Ready to implement on approval.
