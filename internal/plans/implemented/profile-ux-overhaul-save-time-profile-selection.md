# Profile UX Overhaul: Save-Time Profile Selection

## Context

Current profile UX is confusing:

- Sidebar has a "profile selector" that sets a global "active profile"
- All save flows (MCP, extension, web) silently use this active profile
- Users must remember to switch profile BEFORE saving — doesn't scale for high volume (hundreds of memories/day)
- The selector is disconnected from the save action

**New model:**

- Profile is selected **at save time** via dropdown (Web, Extension)
- For MCP, agent asks user which profile to save to
- Remove global "active profile" from sidebar
- Keep profile configuration in existing Profiles settings page

---

## Design Decisions

| Question           | Decision                                        |
| ------------------ | ----------------------------------------------- |
| Profile indicator  | Dropdown only — no toast or header badge        |
| MCP profile config | Tool param only — agent asks user which profile |
| Settings page      | Keep in existing Profiles page (no new page)    |

---

## Changes Overview

| Area                  | Change                                                    |
| --------------------- | --------------------------------------------------------- |
| **Sidebar**           | Remove ProfileSelector component                          |
| **Profiles Settings** | Add default profile config for Web + Extension            |
| **Chrome Extension**  | Add profile dropdown to Settings tab + QuickSave UI       |
| **Web Add Memory**    | Add profile dropdown (pre-filled with default)            |
| **MCP**               | Add `profileId` param to tools + new `list_profiles` tool |
| **Backend**           | Remove activeProfileId, add source defaults               |

---

## Implementation Plan

### Phase 1: Backend — Profile Selection Support

**Files:**

- `packages/backend/convex/schema.ts`
- `packages/backend/convex/userSettings.ts`
- `packages/backend/convex/memoryApi.ts`

**Changes:**

1. Add source defaults to userSettings:

   ```typescript
   defaultProfiles: v.optional(v.object({
     web: v.optional(v.id("profiles")),
     extension: v.optional(v.id("profiles")),
   })),
   ```

2. Remove `activeProfileId` from userSettings (no longer used)

3. Add queries/mutations:
   - `getDefaultProfile(source: "web" | "extension")` — returns configured default
   - `setDefaultProfile(source, profileId)` — set source default

4. Update `memoryApi.createMemory`:
   - Accept `profileId` in args
   - If provided → use it
   - Else fall back to user's default profile

### Phase 2: Remove Sidebar Profile Selector

**Files:**

- `apps/web/src/components/sidebar/SidebarFooter.tsx`
- `apps/web/src/components/sidebar/ProfileSelector.tsx`
- `packages/backend/convex/dashboardApi.ts`

**Changes:**

1. Remove `<ProfileSelector>` from `SidebarFooter.tsx`
2. Remove `getProfilesStats` query (no longer needed)
3. Keep `ProfileSelector.tsx` — repurpose as `ProfileDropdown` for save forms

### Phase 3: Web App — Profile Dropdown in Save Forms

**Files:**

- `apps/web/src/components/AddMemoryForm.tsx`
- `apps/web/src/components/AddMemoryModal.tsx`
- `apps/web/src/context/MemoryContext.tsx`
- `apps/web/src/components/ProfileDropdown.tsx` (new, extracted from ProfileSelector)

**Changes:**

1. Create `ProfileDropdown` component:
   - Compact dropdown showing colored dot + profile name
   - Fetches user's profiles
   - Accepts `value` and `onChange` props

2. Add to `AddMemoryForm` and `AddMemoryModal`:
   - Profile dropdown at top of form
   - Pre-filled with web default profile
   - Pass selected `profileId` to `createMemory()`

3. Update `MemoryContext.createMemory()`:
   - Accept `profileId` parameter
   - Pass to backend

### Phase 4: Chrome Extension — Profile Selection

**Files:**

- `apps/chrome-extension/src/popup/_components/QuickSave.tsx`
- `apps/chrome-extension/src/popup/_components/SettingsForm.tsx`
- `apps/chrome-extension/src/background/api-client.ts`
- `apps/chrome-extension/src/background/message-handler.ts`

**Changes:**

1. Add "Default Profile" dropdown to `SettingsForm.tsx`:
   - Fetch profiles from API
   - Store selection in chrome.storage.local
   - Sync to backend (extension default)

2. Add profile dropdown to `QuickSave.tsx`:
   - Pre-filled with extension default
   - User can override per-save
   - Pass `profileId` in save request

3. Update `api-client.ts` and message handler:
   - Accept and pass `profileId` param

### Phase 5: MCP — Profile Tools

**Files:**

- `apps/mcp/src/tools.ts`

**Changes:**

1. Add `profileId` optional param to `memory_add` tool:

   ```typescript
   profileId: z.string()
     .optional()
     .describe(
       "Profile ID to save to. Use list_profiles to see available profiles.",
     );
   ```

2. Add new `list_profiles` tool:
   - Returns array of `{ id, name, color, icon }`
   - Agent can show options to user

3. Update `memory_add` handler:
   - Pass `profileId` to API if provided
   - If not provided, falls back to default profile

### Phase 6: Profiles Settings — Source Defaults

**Files:**

- `apps/web/src/routes/_main/settings/profiles.tsx`

**Changes:**

1. Add "Default Profiles" section to existing Profiles settings page:
   - "Web App" → profile dropdown
   - "Browser Extension" → profile dropdown
   - Note: "MCP clients will ask which profile to save to"

2. Save selections to `userSettings.defaultProfiles`

---

## Files to Modify

### Backend

- `packages/backend/convex/schema.ts` — add defaultProfiles to userSettings
- `packages/backend/convex/userSettings.ts` — add get/set default profile mutations
- `packages/backend/convex/memoryApi.ts` — accept profileId param
- `packages/backend/convex/dashboardApi.ts` — remove getProfilesStats

### Web App

- `apps/web/src/components/sidebar/SidebarFooter.tsx` — remove ProfileSelector
- `apps/web/src/components/ProfileDropdown.tsx` — new compact dropdown component
- `apps/web/src/components/AddMemoryForm.tsx` — add profile dropdown
- `apps/web/src/components/AddMemoryModal.tsx` — add profile dropdown
- `apps/web/src/context/MemoryContext.tsx` — pass profileId
- `apps/web/src/routes/_main/settings/profiles.tsx` — add source defaults section

### Chrome Extension

- `apps/chrome-extension/src/popup/_components/QuickSave.tsx` — add profile dropdown
- `apps/chrome-extension/src/popup/_components/SettingsForm.tsx` — add default profile setting
- `apps/chrome-extension/src/background/api-client.ts` — pass profileId
- `apps/chrome-extension/src/background/message-handler.ts` — include profileId

### MCP

- `apps/mcp/src/tools.ts` — add profileId param + list_profiles tool

---

## Verification

1. **Web App**: Add memory → profile dropdown visible, correct profile used
2. **Extension**: Set default in settings → QuickSave uses it → override works
3. **MCP**: `list_profiles` returns profiles → `memory_add` with profileId works
4. **Settings**: Set web/extension defaults → dropdowns pre-fill correctly
5. **Migration**: Remove activeProfileId without breaking existing users

---

## Migration Notes

- `activeProfileId` removed from userSettings
- Existing memories already have profileId (from previous migration)
- New `defaultProfiles` field replaces activeProfileId
- On first load, defaults unset → falls back to user's default "Personal" profile
