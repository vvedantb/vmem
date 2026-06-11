# Workspace-first routes + team-wide content

## Context

Teams exist (teams/teamMembers/team profiles, /teams UI) but only memories are team-scoped; skills, wiki, files, chat are user-wide. Goal: profiles become **workspaces** (Vercel model). Every route moves under `/$profileId/` (raw Convex profile id); a workspace switcher (styled like the account card `SidebarUserMenu`) sits at top of sidebar; team profiles get team-wide skills/wiki/files; chat threads become profile-scoped.

## Locked decisions

- Scoping = "user-wide + team": skills/wikiNodes/fileNodes get optional `teamId`. Absent = personal (visible in ALL personal workspaces, no migration). Set = team-scoped.
- URL segment = raw Convex profile id. Only `/settings/**` stays user-level (plus `/`, `/agent-callback`, `/mcp/oauth/authorize` untouched).
- Chat threads profile-scoped, private to creator (one thread per profile, current single-thread UX).
- /teams/\*\* dies — members/settings fold into team workspace nav; overview→home, knowledge→memories.
- Team edit policy: any member creates/edits team wiki/files/skills; delete = creator or team owner.
- MCP stays personal-only this release (add leak guards only). Team MCP data = follow-up.
- Dashboard/home + sidebar stats become workspace-scoped (reverses old user-wide rule).

---

## Phase 1 — Web route refactor (no backend changes)

Verified ground truth: app is 100% `convex/react` useQuery (no loaders); router context only has `isSignedIn`; the validation pattern to clone is `routes/_main/teams/$teamId/route.tsx` (useQuery → spinner/not-found/context-provider); sidebar renders ABOVE the outlet so it must use `useParams({ strict: false })` (pattern: `TeamsSidebarNav.tsx:26`).

1. **New helpers** (`apps/web/src/components/workspace/`):
   - `active-profile.tsx`: `ActiveProfileProvider` + `useActiveProfile()` (inside outlet, full `Doc<"profiles">`) + `useActiveProfileId()` (shell/sidebar: `useParams({strict:false}).profileId` → localStorage `vmem:last-profile-id` fallback for `/settings/**`).
   - `workspace-paths.ts`: `LEGACY_FIRST_SEGMENTS` list + `workspacePathFor(pathname, nextProfileId)` (strip first segment, drop detail ids `/skills/$id`→`/skills` etc., `/team/*`→`/home` when target personal).
2. **`routes/_main/$profileId/route.tsx`** (new layout): `useQuery(api.profiles.list)` → find by param (string-safe — `api.profiles.get` arg is `v.id` and would throw on garbage). undefined→spinner; no match → if param ∈ LEGACY_FIRST_SEGMENTS render `LegacyPathRedirect`, else `WorkspaceNotFound` (+ go-to-my-workspace button); match → remember in localStorage + `ActiveProfileProvider` + Outlet. New `$profileId/index.tsx` → component-level `<Navigate to="./home">` (NOT beforeLoad — legacy check must render first; `/chat` matches `$profileId="chat"`).
3. **git mv** `routes/_main/{chat,voice,files}.tsx`, `memories/**`, `codebases/**`, `skills/**`, `wiki/**`, `activity/**`, `inbox/**`, legacy stubs (`notifications,proposals,ai-logs,openrouter-logs`) → `routes/_main/$profileId/`. `settings/**`, `svg-playground` stay. Vite plugin rewrites `createFileRoute` literals + regenerates routeTree on next dev run.
4. **Entry**: `routes/_main/home.tsx` STAYS at `/home` (Clerk `signInFallbackRedirectUrl`, agent-callback target, MCP OAuth bounce in its beforeLoad) but its component becomes `WorkspaceEntryRedirect`: resolve last-visited (localStorage, validated against profiles.list) → `defaultProfiles.web` → `isDefault` → first; empty list → `getOrCreateDefault`; then navigate `/$profileId/home` replace. Dashboard body moves to new `$profileId/home.tsx`.
5. **Legacy deep-links**: root `notFoundComponent` in `__root.tsx` → `LegacyPathRedirect` (first segment ∈ legacy list → prepend resolved default workspace id, preserve search; `/teams/$teamId/*` → resolve via `api.teams.get` → team workspace equivalents; else real 404 page). Cheap, keep permanently.
6. **Links/nav** (compiler-driven — literal `to:` strings all go red):
   - `sidebar/types.ts`: `NavItem.href: LinkProps["to"]` (kills silent string widening).
   - `nav-config.ts`: hrefs → `/$profileId/...`; **remove Teams item** (switcher owns workspaces). `NavLink` passes `params={{profileId}}`.
   - `SidebarNavigation.navViewFromPathname`: `/settings` first, then strip first segment before matching skills/wiki/codebases; drop `teams` view.
   - Inside-outlet navigations inherit `profileId` (only `to` string changes): memories/skills/codebases/activity/inbox route files + tabs, `MemorySearch`, `WikiWorkspace`, `ListItemRow`, chat components, `QuickActionsGrid`, `RecentActivityList`, `SynthesisProposalCard`. Outside-outlet need explicit params via `useActiveProfileId()`: `SidebarHeader` (logo→home), `SkillsSidebarNav`, `WikiSidebarNav`, `CodebasesSidebarNav`, `CommandPalette`. Import paths `@/routes/_main/...`→`@/routes/_main/$profileId/...` (hooks/useMemoryGraphController etc.).

## Phase 2 — Switcher + teams consolidation + stats

1. **`SidebarWorkspaceSwitcher.tsx`**: structural clone of `SidebarUserMenu` (button `bg-surface-secondary p-2 hover:bg-surface-tertiary`, h-7 w-7 avatar = profile color @20% bg + `getProfileIcon` glyph per ProfileCard treatment, name + "Personal"/"Team workspace" subtitle, IconSelector chevron; collapsed→avatar-only + tooltip, dropdown side=right). Dropdown: Personal section / Teams section (partition by `teamId`), check on active, footer: Create profile (extracted `CreateEditProfileDialog`), Create team (`CreateTeamDialog` moved to `components/teams/`), Manage → `/settings/profiles`. Select → `navigate(workspacePathFor(...))` + remember. Mount in `Sidebar.tsx` between header and navigation (desktop + mobile dialog), only when `navView === "main"`.
2. **Teams fold-in**: new `routes/_main/$profileId/team/route.tsx` (guard: `!profile.teamId` → redirect home; else `api.teams.get(profile.teamId)` + `TeamDetailProvider` moved to `components/teams/`) + `team/members.tsx`, `team/settings.tsx` (reuse moved `TeamMembers`/`TeamSettings`). Conditional "Team" nav group in `SidebarNavigation` when active profile has teamId. Delete `routes/_main/teams/**`, `TeamsSidebarNav`, `TeamSidebarGroup/Card/SubNav`, `teams` nav view, `TeamOverview`, `TeamKnowledge`. `api.teams.create` must return new team's `profileId` (small backend change) → navigate to team workspace. `TeamSettings` delete-team → navigate `/home`.
3. **Stats**: `Sidebar.tsx` StatsCard + `Dashboard.tsx` pass `profileId` to `api.dashboardApi.getStats` (already accepts it); add profileId to refresh deps. `dashboardApi.getRecentActivity` passes profileId through (internal already supports).
4. **CommandPalette**: "Switch Profile" group → workspace navigation via `workspacePathFor` (drop `setDefaultProfile` call).

## Phase 3 — Backend team scoping (skills/wiki/files) + team workspace data

Convention: web passes `teamId?: Id<"teams">` (derived from `useActiveProfile().teamId`) on list/create. By-id mutations take NO scope arg — permissions derive from the doc.

1. **Schema** (`validators.ts` + `schema.ts`): extract `skillFields` to validators.ts (currently inline in schema — fixes convention violation) and add `teamId: v.optional(v.id("teams"))` to `skillFields`/`wikiNodeFields`/`fileNodeFields`. Indexes: skills `by_team`/`by_team_name`; wikiNodes `by_team`/`by_team_parent` + `teamId` in search-index filterFields; fileNodes `by_team`/`by_team_parent`. Add `users.getByIds` for "Saved by X" attribution (existing `userId` = creator, mirrors team memories). No data migration.
2. **Helpers** (`convex/teams/auth.ts`): `resolveContentScope(ctx, userId, teamId?)` (asserts membership), `assertContentMutable(doc, userId)` — team docs: edit = any member, delete = creator or team owner; personal: owner.
3. **skills.ts / wiki.ts / files.ts**: list/tree/search/create gain optional `teamId` (team → by_team index; personal → by_user + **`teamId === undefined` leak-guard filter** — apply to ALL ~18 by_user read sites incl. every `*ByClerkIdInternal` MCP path and `wiki.listForUserInternal`); dup-name/sibling/subtree/quota checks scope-aware; team file storage = separate per-team 10 GiB pool; skills context-prompt invalidation skipped for team-scoped writes.
4. **Memories in team workspace**: `/$profileId/memories` for team profile resolves scope server-side via existing `runResolveMemoryScopeInternal` (first real consumer); port "Saved by X" column from old TeamKnowledge into the memories list when workspace is team.
5. **Skills prompt index**: team context = personal + that team's skills merged (cloud chat fetch by clerkId+teamId; local chat/voice call `listMy({})` + `listMy({teamId})`). `contextPromptCache` untouched (stays personal-only).
6. Run `cd packages/backend && npx convex codegen --typecheck enable` after each step (all additive-optional).

## Phase 4 — Chat threads profile-scoped

Ordering constraint: backend default rule ships in the SAME deploy web starts creating per-profile threads, or mobile's no-arg `getOrCreateThread` ("latest thread wins", chat.ts:112-131) adopts a team thread.

1. New `threadProfiles` table `{userId, threadId, profileId, createdAt}` (by_thread, by_user_profile).
2. `getOrCreateThread({profileId?})`: profile-mapped lookup (NOT latest-thread); absent arg → default personal profile (mobile/voice safe unchanged); legacy threads lazily adopted into default personal profile. `clearChatHistory` carries mapping to replacement thread.
3. `initiateStreaming`: resolve thread's profile → `runResolveMemoryScopeInternal` → thread scope+profileId into `chatStreamActions.streamAsync` → `buildOpenRouterTools` (replace hardcoded `scope:"personal"`, pin profileId in memory tools instead of MCP-default resolution).
4. Security fix (pre-existing): add thread-ownership assertions to `listThreadMessages`, `getThreadMessageUsage`, `saveLocalMessages`.
5. `memoryApi.retrieveMemories` gains optional `profileId` (internal already accepts) for web local chat/voice grounding.
6. Web: `useCloudChat`/`useLocalChat`/`VoiceClient`/`Chat` pass `useActiveProfile()._id`.

## Phase 5 — Cleanup

1. **Profile filter removal** (route now scopes): delete `profile` key from memories `-searchParams.ts` + sanitizer branch; strip from `lib/memory-view-filters.ts`, `MemorySearch`, `MemoryFiltersButton`/Graph/List header controls; delete `UnifiedFilterPanel/ProfileTab.tsx`; `useGraphData` profileId = always active workspace. Activity: remove profileId filter param + per-row ProfileBadge (route scopes).
2. **Save defaults**: `AddMemoryModal`/`ProfileDropdown` default to active workspace profile; `/settings/profiles` DefaultProfilesSection drops the "Web App" row (keep Extension/MCP).
3. **Docs sweep**: `apps/docs` bare-path references (~14 mdx files).
4. **CLAUDE.md**: rewrite Profiles section (workspace model, route prefix now required, stats workspace-scoped, teamId scoping rules, threadProfiles). Run `/changelog`.

## Not touched (verified)

Chrome extension (route-agnostic, origin-only links), mobile app (no-arg getOrCreateThread + listMy stay back-compat by design), MCP tools/oauth (`/mcp/oauth/authorize` + `/settings/playground/callback` must NOT move), `buildSkillsIndexAddition` signature (takes pre-fetched entries), no email/URL emitters exist.

## Verification

- `npx tsc` in apps/web (compiler catches every `to:` literal) + backend codegen typecheck.
- agent-browser via `/?agent`: entry redirect → `/$id/home`; switcher switches keeping sub-route (`/A/skills`→`/B/skills`); legacy URLs `/chat`, `/memories/graph?focus=x`, `/teams/$teamId/members` all redirect; foreign/garbage profileId → not-found; `/settings/**` keeps remembered workspace context.
- Two-user team flow: member B sees team skills/wiki/files/memories in team workspace, NOT in personal; non-member URL → 404; member edits team doc, only creator/owner deletes.
- Chat: team workspace thread grounds retrieval to team scope; personal threads unaffected; mobile still resolves personal thread.
- `node scripts/test-vmem-mcp.mjs` (21-tool E2E) passes untouched.

## Unresolved questions

1. Team file storage quota: assumed separate 10 GiB pool per team (vs counting against creator) — confirm.
2. Codebases: assumed they stay user-wide data visible in every workspace (tied to user's GitHub creds) — confirm.
3. Cross-scope moves (personal↔team) for skills/wiki/files: assumed out of scope v1.
4. Phasing: each phase is independently shippable; assumed ship sequentially on staging as one effort.
