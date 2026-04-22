# User Context Settings Feature

## Context

User wants a settings page where they can define "About Me" and "Preferences" text fields. This user context will be automatically included in memory retrieval responses, allowing third-party AI apps to personalize their interactions based on user-provided context.

**Decision:** Store in settings (not wiki) to keep wiki pure for notes, and make retrieval straightforward via API.

---

## Implementation

### 1. Schema — Add fields to `userSettings`

**File:** `packages/backend/convex/schema.ts`

Add to `userSettingsFields`:

```ts
aboutMe: v.optional(v.string()),        // ~500 char freeform
preferences: v.optional(v.string()),    // ~500 char freeform
```

### 2. Validators

**File:** `packages/backend/convex/validators.ts`

Add validators for the new fields (if `userSettingsFields` is exported there).

### 3. Backend API — Update `userSettings.ts`

**File:** `packages/backend/convex/userSettings.ts`

- `get()` — include `aboutMe` and `preferences` in return (default to empty string)
- `update()` — accept `aboutMe` and `preferences` in args, persist to DB

### 4. Settings UI — Add section to preferences page

**File:** `apps/web/src/routes/_main/settings/preferences.tsx`

Add new section at **top** of page (before memory settings):

- "About You" header with user icon
- "About Me" textarea — describe yourself, background, goals
- "Preferences" textarea — communication style, how you want AI to interact
- Debounced autosave on change (match existing pattern in file)

### 5. Memory Retrieval — Include user context

**File:** `packages/backend/convex/memoryApi.ts`

Update `retrieveMemories` response to include:

```ts
{
  memories: MemoryCandidate[],
  userContext: {
    aboutMe: string | null,
    preferences: string | null
  }
}
```

Fetch user settings and attach to response. AI apps receive this automatically with every retrieval call.

---

## Files to Modify

| File                                                 | Change                                           |
| ---------------------------------------------------- | ------------------------------------------------ |
| `packages/backend/convex/schema.ts`                  | Add `aboutMe`, `preferences` to userSettings     |
| `packages/backend/convex/validators.ts`              | Add field validators if needed                   |
| `packages/backend/convex/userSettings.ts`            | Update get/update to handle new fields           |
| `apps/web/src/routes/_main/settings/preferences.tsx` | Add "About You" section with textareas           |
| `packages/backend/convex/memoryApi.ts`               | Include userContext in retrieveMemories response |

---

## Verification

1. Navigate to `/settings/preferences`
2. Fill in About Me and Preferences fields
3. Verify data persists on page refresh
4. Call `retrieveMemories` API and confirm `userContext` appears in response
5. Run `npx convex codegen --typecheck enable` to verify types
