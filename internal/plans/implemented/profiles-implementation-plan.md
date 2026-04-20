# Profiles Implementation Plan

## Context

Memories currently belong to users only. No way to organize memories by context (work vs personal). Adding Profiles = Chrome-like workspaces for memories. Each memory belongs to exactly one profile.

---

## Design Decisions

| Decision         | Choice                                                     |
| ---------------- | ---------------------------------------------------------- |
| Memory:Profile   | 1:1 (strict ownership)                                     |
| Storage          | Convex `profiles` table + `profileId` prop on Neo4j Memory |
| MCP selection    | Active profile default + optional `profileId` override     |
| Profile settings | None (user-level only)                                     |
| Migration        | Auto-migrate existing memories to "Personal"               |
| Styling          | Color + icon per profile                                   |

---

## Phase 1: Convex Schema + CRUD

### 1.1 Add `profiles` table to schema.ts

```typescript
profiles: defineTable({
  userId: v.id("users"),
  name: v.string(),
  color: v.string(),        // hex e.g. "#3B82F6"
  icon: v.string(),         // icon name e.g. "briefcase"
  isDefault: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_default", ["userId", "isDefault"])
  .index("by_user_name", ["userId", "name"]),
```

### 1.2 Add `activeProfileId` to userSettings

```typescript
activeProfileId: v.optional(v.id("profiles")),
```

### 1.3 Create profiles.ts CRUD module

**File:** `packages/backend/convex/profiles.ts`

Functions:

- `list` - authQuery, list user's profiles
- `get` - authQuery, get by id
- `getOrCreateDefault` - authMutation, lazy-create "Personal" if none
- `create` - authMutation, validate name uniqueness
- `update` - authMutation, rename/recolor/re-icon
- `remove` - authMutation, cannot delete default, requires target profile or delete flag for memories
- `setActive` - authMutation, update userSettings.activeProfileId

Internal queries for MCP:

- `getByIdInternal` - internalQuery
- `getActiveByClerkIdInternal` - internalQuery
- `getOrCreateDefaultByClerkIdInternal` - internalMutation

---

## Phase 2: Neo4j Changes

### 2.1 Add profileId to Memory nodes

**File:** `packages/backend/src/neo4j/memoryService.ts`

Add `profileId: string` to `MemoryNode` interface.

### 2.2 Add composite index

**File:** `packages/backend/src/neo4j/setup.ts`

```cypher
CREATE INDEX memory_user_profile IF NOT EXISTS
FOR (m:Memory) ON (m.userId, m.profileId)
```

### 2.3 Update MemoryService functions

Add `profileId` param to:

- `createMemory` (required)
- `upsertFromSource` (required)
- `listMemories` (optional filter)
- `searchMemories` (optional filter)
- `retrieveMemories` (optional filter)
- `getStats` (optional filter)
- `getRecentActivity` (optional filter)
- `getGraphData` (optional filter)
- `getLocalGraph` (optional filter)

Query pattern:

```cypher
WHERE m.userId = $userId AND ($profileId IS NULL OR m.profileId = $profileId)
```

---

## Phase 3: Migration

### 3.1 Migration action

**File:** `packages/backend/convex/neo4jActions/migration.ts`

```typescript
export const migrateMemoriesToProfile = internalAction({...})
```

1. Get user's default profile (create if missing)
2. Run Cypher to set profileId on memories where NULL
3. Return count migrated

### 3.2 Query-time fallback

Until migration complete, treat `profileId IS NULL` as default profile in queries.

---

## Phase 4: API + MCP

### 4.1 HTTP endpoints

**File:** `packages/backend/convex/http.ts`

| Endpoint                       | Method | Description                    |
| ------------------------------ | ------ | ------------------------------ |
| `/api/mcp/profiles/list`       | POST   | List profiles                  |
| `/api/mcp/profiles/active`     | POST   | Get active profile             |
| `/api/mcp/profiles/set-active` | POST   | Set active                     |
| `/api/mcp/whoami`              | POST   | Enhanced: include profile info |

### 4.2 Neo4j action updates

**File:** `packages/backend/convex/neo4jActions/mcp.ts`

Add `profileId` param to all memory actions. Resolution logic:

1. If `profileId` provided, validate ownership
2. Else get active profile from userSettings
3. Else lazy-create default profile

### 4.3 MCP tool updates

**File:** `apps/mcp/src/tools.ts`

Add optional `profileId` param to:

- `memory_search`
- `memory_retrieve`
- `memory_add`
- `memory_update`
- `memory_delete`

Update `whoami` to return:

```typescript
{
  clerkUserId: string,
  activeProfile: { id, name, color, icon } | null,
  profiles: Array<{ id, name, isDefault }>
}
```

---

## Phase 5: Frontend

### 5.1 ProfileSelector component

**File:** `apps/web/src/components/sidebar/ProfileSelector.tsx`

- Dropdown in SidebarFooter (above UserButton)
- Shows colored dot + profile name
- List of profiles with checkmark on current
- "Manage Profiles" link
- Collapsed mode: just colored dot with HoverCard

### 5.2 Profile management page

**File:** `apps/web/src/routes/_main/settings/profiles.tsx`

- Card grid + side panel pattern (like skills page)
- Create/edit/delete profiles
- Color picker (8-10 preset colors)
- Icon picker (10-12 Tabler icons)
- Cannot delete default profile
- Delete flow: show memory count, choose target profile OR delete all memories

### 5.3 Memory list integration

**Files:**

- `apps/web/src/components/MemorySearch.tsx`
- `apps/web/src/routes/_main/memories/-searchParams.ts`

- Add `profileId` to search params
- Default filter to active profile
- Profile badge on memory rows
- "All Profiles" filter option

### 5.4 First-run experience

**File:** `packages/backend/convex/auth.ts`

In `ensureUserExists`: if user created, also create default "Personal" profile.

---

## Files to Modify

| File                                                  | Changes                                             |
| ----------------------------------------------------- | --------------------------------------------------- |
| `packages/backend/convex/schema.ts`                   | Add profiles table, activeProfileId to userSettings |
| `packages/backend/convex/profiles.ts`                 | **NEW** - CRUD                                      |
| `packages/backend/convex/userSettings.ts`             | Add activeProfileId handling                        |
| `packages/backend/convex/auth.ts`                     | Auto-create default profile                         |
| `packages/backend/src/neo4j/setup.ts`                 | Add index                                           |
| `packages/backend/src/neo4j/memoryService.ts`         | Add profileId everywhere                            |
| `packages/backend/convex/neo4jActions/mcp.ts`         | Add profileId, resolution                           |
| `packages/backend/convex/neo4jActions/migration.ts`   | **NEW** - migration                                 |
| `packages/backend/convex/http.ts`                     | Profile endpoints                                   |
| `apps/mcp/src/tools.ts`                               | Add profileId to tools                              |
| `apps/mcp/src/api-client.ts`                          | Profile API functions                               |
| `apps/web/src/components/sidebar/SidebarFooter.tsx`   | Add ProfileSelector                                 |
| `apps/web/src/components/sidebar/ProfileSelector.tsx` | **NEW**                                             |
| `apps/web/src/routes/_main/settings/profiles.tsx`     | **NEW**                                             |

---

## Verification

1. **Type check:** `cd packages/backend && npx convex codegen --typecheck enable`
2. **Create profile:** Dashboard settings > Profiles > Add
3. **Switch profile:** Sidebar dropdown, verify memories filter
4. **MCP test:** `memory_add` without profileId uses active, with profileId uses specified
5. **Migration:** Run migration action, verify existing memories have profileId
6. **Delete profile:** Cannot delete default, shows memory count + choice (move to X / delete all)
