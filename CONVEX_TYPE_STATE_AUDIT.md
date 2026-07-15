# Convex type + reactive-state audit

> Generated 2026-07-15 via parallel Composer explore agents across `apps/web`, `apps/chrome-extension`, `packages/backend`, `packages/shared`, `packages/sdk`.

## Verdict

Most Convex-table domains (wiki, skills, profiles, files, teams, connectors, AI logs) already use `Doc<>` / `FunctionReturnType`. The remaining debt clusters in:

1. Neo4j-backed **memory** view models (`Memory`, `ListItem`) sitting beside already-correct FRT aliases
2. Context providers that **snapshot** live query results
3. Extension settings / default-profile **split brain** with Convex
4. Backend tables still defined **inline** without `xxxFields`

TanStack over Convex **actions** (memory list, graph, proposals) is justified — those are Neo4j `authAction`s, not Convex queries. Do not replace those with `useQuery` unless new Convex query wrappers exist.

---

## P0 — do next (high ROI / real drift)

| #   | Area                                     | Finding                                                                                                                       | Fix                                                                                            |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Web `lib/memories.ts`                    | Hand-rolled `Memory` duplicates `MemoryApiFields` (already FRT)                                                               | `type Memory = MemoryApiFields` or `ReturnType<typeof memoryFromApi>`; drop parallel interface |
| 2   | Web `lib/list-items.ts`                  | Hand-rolled `ListItem` union re-declares wiki/skill/memory fields                                                             | Extend FRT row types; add only UI fields (`childCount`, prefixed ids)                          |
| 3   | Web MemoryContext                        | Facade over TanStack recent slice + hand types; legacy `components/contexts/MemoryContext` + root duplicates                  | Kill legacy provider/files; thin hooks; invalidate `["retrieveMemories"]` too                  |
| 4   | Web ActiveProfile / TeamDetail providers | Pass **snapshots** of `useQuery` data into context                                                                            | Pass IDs; re-subscribe in consumers (or pass live query result without freezing)               |
| 5   | Extension default profile                | `chrome.storage.defaultProfileId` ignores Convex `defaultProfiles.extension`                                                  | Convex as source of truth; storage only for SW/content mirror                                  |
| 6   | Backend `schema.ts`                      | Tables without `xxxFields`: `apiKeys`, `connectors`, `userSettings`, `oauthStates`, `githubConnections`, `contextPromptCache` | Extract fields → schema + return validators                                                    |

## P1 — clear type/state wins

| #   | Area                            | Finding                                                                                                 | Fix                                                               |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 7   | Web EnvVar                      | Hand-rolled `{ key, value }`                                                                            | `FunctionReturnType<typeof api.userEnvVars.list>[number]`         |
| 8   | Web Profile aliases             | `Profile` / `ProfileListItem` redefined ~6×                                                             | `profiles/-types.ts` → `Doc<"profiles">`                          |
| 9   | Web hooks filters               | `MemoryListFilters`, `CodebaseGraphFilters` hand-rolled                                                 | `Pick<FunctionArgs<typeof api.…>, …>`                             |
| 10  | Web NotificationContext         | Thin wrapper + hand `NotificationType`                                                                  | Hook + `Doc<"notifications">["type"]`                             |
| 11  | Web graph                       | `liveRelatesToEdges` + `contentCache` local server caches; no `["graph"]` invalidation on memory events | Invalidate graph queries; TanStack for node content               |
| 12  | Web EventsPanel / Sidebar stats | `useState` + manual action fetch                                                                        | Shared TanStack hooks (mirror Dashboard)                          |
| 13  | Extension settings              | Double-write auto-sync; auto-search/capture local-only                                                  | Single write via Convex mirror; add Convex fields if cross-device |
| 14  | Backend patches                 | `WikiNodePatch`, `SkillWritableFields`, version `returns` restating fields                              | `Partial<Pick<Doc<…>>>` / spread `xxxFields`                      |
| 15  | Shared/SDK                      | `SkillIndexEntry` ≡ backend `SkillIndexSlice`; SDK `Structured*Input` hand-rolled vs contract zod       | Shared type; SDK request schemas via `z.infer`                    |

## P2 — nice / consolidate

- Derive `GraphNodeKind` / `GraphEdgeType` from `ApiGraphNode["kind"] \| CodeNodeKind`
- `UserSettings = FunctionReturnType<typeof api.userSettings.get>` in `settings/-types.ts`
- Deduplicate save-result types in extension messages
- Export `WikiVersionSummary`; tighten SkillHistory props via `Pick`
- Memory list: dual fetch (`useMemoryListFlat` + `useRecentMemories` 1000-cap) → facet/stats accuracy risk
- Delete dead orphans if still present (`_components/graph-data.ts`, unused `useTimelineEvents`)

## Correct patterns (do not “fix”)

- Wiki / files / skills / teams / codebases `-types.ts` using FRT
- Graph API layer already on `FunctionReturnType<typeof api.graphApi.getGraphData>`
- TanStack for Neo4j actions; Convex `useQuery` for Convex tables
- Edit buffers (`WikiArtifactEditor` draft content) — legitimate local state
- SDK response zod at publish boundary — intentional duplicate of HTTP shapes

## Suggested work order

1. Memory type consolidation + kill legacy MemoryContext duplicates
2. Provider snapshot → live subscription (profile, team, notifications)
3. Backend `xxxFields` extraction for the six high-traffic tables
4. Extension default-profile + settings single-write path
5. Graph event invalidation / drop `liveRelatesToEdges`
6. EnvVar + Profile `-types` cleanup (quick)

Agents: [hooks](a2d41251-53be-4e56-820a-dce9dfbf04ca) · [lib](d62cbd11-38ff-4aad-88e8-52f2b4692181) · [components](8e8e296e-9459-4e6e-a8ea-80ea71160fa9) · [routes/ctx](612ba010-d268-478d-a6ff-6c49b19ed0e5) · [extension](67417d77-d7cc-4d6e-b149-d44f26b40864) · [backend](535af026-b870-46be-bf25-4a506577a5b3) · [shared/sdk](868ae0b5-3b2c-4c98-bf95-e18401fd243f) · [memory-list](a6d2fb76-4f34-4aac-bbfc-09bf4a718710) · [wiki/skills/…](c9836874-146c-4068-b7d6-2442eb4f7376) · [graph](cbfe08f7-ee87-4729-9d49-ea7049d0b9a5)
