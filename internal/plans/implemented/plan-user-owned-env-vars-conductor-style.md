# Plan: User-owned Env Vars (conductor-style)

## Context

Users currently can't supply their own third-party API keys (OpenRouter etc.) — they'd be globally set in Convex dashboard env vars, which isn't user-owned. Build a settings page where each user can CRUD their own env vars; Convex actions resolve per-user-decrypted values at call time. Mirror the UX + backend layout of `C:\Vedant\Personal\GitHub\conductor` almost verbatim.

No runtime OpenRouter call sites exist in vmem yet (chat inference is in-browser via `@convex-dev/agent`). This plan ships the storage + CRUD + resolver helper. First consumer wires up when a server-side OpenRouter action lands.

## Decisions (from interview + conductor alignment)

- **Storage shape**: single document per user holding `vars: v.array({ key, value })` — mirrors conductor exactly. Env vars are small + bounded; 1MB doc ceiling is a non-issue.
- **Crypto**: reuse vmem's existing `packages/backend/convex/lib/crypto.ts` (`encryptToken` / `decryptToken`, WebCrypto AES-GCM, `v1:iv:ct` format). `ENCRYPTION_KEY` env already provisioned. Avoids needing `"use node"` on the actions file.
- **Listing**: `list` query returns `{ key, value: "••••••" }` — masked backend-side, conductor-style. Reveal is a separate action.
- **Upsert**: one `upsertVar` action — encrypts on write. Same function handles create + update-in-place.
- **Edit key name**: allowed (per earlier interview). Implement as an `editVar` action taking `oldKey`, `newKey`, optional `value` — when value absent, keeps existing ciphertext. Atomic remove-old + add-new inside the same internal mutation.
- **Bulk paste**: keep conductor's `.env`-format paste dialog.
- **Inline editing**: keep conductor's inline rows (add/edit inside the table) — no separate modal. Matches the "feels like editing a `.env` file" metaphor.
- **Nav**: `Settings → Env Vars` at `/settings/env-vars`. (Overriding earlier "Secrets" label because "Env Vars" matches the conductor UX naming and the user's own original wording.)
- **Scope**: user-only. No team scope for v1 — add later if needed.
- **Dropped from conductor**: `sandboxExclude`, sandbox-excluded section, tabs (repo vs team) — none applicable to vmem.

## Reuse

- Crypto → `packages/backend/convex/lib/crypto.ts` (`encryptToken`, `decryptToken`, `getEnvOrThrow`).
- Auth wrappers → `packages/backend/convex/auth.ts` (`authQuery`, `authMutation`, `authAction`, `ctx.userId`).
- Validators const-spread → `packages/backend/convex/validators.ts`.
- UI primitives → `@vmem/ui` (`Button`, `Dialog*`, `Input`, `Textarea`, `Spinner`). All already exist.
- Sidebar nav entry pattern → `apps/web/src/components/sidebar/nav-config.ts` (`settingsNavItems`).
- Page shell → `PageContainer` (see `apps/web/src/routes/_main/settings/api-keys.tsx` for positioning of `title` + `rightSection`).

## Backend (`packages/backend/convex/`)

### 1. `validators.ts` — add `userEnvVarFields`

```ts
export const userEnvVarFields = {
  userId: v.id("users"),
  vars: v.array(
    v.object({
      key: v.string(),
      value: v.string(), // ciphertext from encryptToken()
    }),
  ),
  updatedAt: v.number(),
};
```

### 2. `schema.ts` — register table

Import `userEnvVarFields` alongside existing imports. Add:

```ts
userEnvVars: defineTable(userEnvVarFields).index("by_user", ["userId"]),
```

### 3. `userEnvVars.ts` — queries, mutations, internal helpers (no `"use node"`)

Mirrors `conductor/packages/backend/convex/teamEnvVars.ts`. Public:

- `list` (`authQuery`) — returns `Array<{ key: string; value: string }>`; masks `value` as `"••••••"` server-side. Looks up single doc via `by_user` index → returns `doc.vars.map(v => ({ key: v.key, value: "••••••" }))`, or `[]` when none.

- `removeVar` (`authMutation`) — args `{ key }`. Reads doc; patches with `vars.filter(v => v.key !== key)` + `updatedAt`.

Internal (not exposed on `api`):

- `getAllInternal` (`internalQuery`) — args `{ userId }` → returns `Array<{ key, value }>` with raw ciphertext. For the resolver helper.

- `upsertVarInternal` (`internalMutation`) — args `{ userId, key, value, preservedPrevKey? }`. If `preservedPrevKey` supplied and different from `key`, strips the old entry first. Strips any existing entry with same `key`, pushes `{ key, value }`, patches/inserts doc.

### 4. `userEnvVarsActions.ts` — encrypt/decrypt boundary

Mirrors `conductor/packages/backend/convex/teamEnvVarsActions.ts`. No `"use node"` (WebCrypto works in default runtime). Uses `authAction` from `./auth`.

- `upsertVar` (`authAction`) — args `{ key, value }`. Trim/validate key (non-empty, ≤64 chars, `/^[A-Za-z_][A-Za-z0-9_]*$/`-ish). Encrypt via `encryptToken(value)`. Call `internal.userEnvVars.upsertVarInternal` with `userId = ctx.userId`.

- `editVar` (`authAction`) — args `{ oldKey, newKey, value? }`. Loads via `internal.userEnvVars.getAllInternal`, finds the entry by `oldKey`. If `value` supplied, encrypts new ciphertext; else reuses existing ciphertext. Calls `upsertVarInternal` with `key = newKey`, `preservedPrevKey = oldKey`.

- `revealValue` (`authAction`) — args `{ key }` → `string | null`. Loads via `internal.userEnvVars.getAllInternal`, finds entry, `decryptToken`.

- `bulkUpsert` (`authAction`) — args `{ entries: v.array(v.object({ key, value })) }`. Encrypts each, calls `upsertVarInternal` once per entry (keeps individual validation/error surfaces per entry). Returns `{ imported: number }`.

### 5. `lib/envVars.ts` — resolver helper (for future actions)

```ts
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { decryptToken } from "./crypto";

/** Returns a `{ KEY: plaintext }` map of all env vars for a user. */
export async function resolveUserEnvVars(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<Record<string, string>> {
  const vars = await ctx.runQuery(internal.userEnvVars.getAllInternal, {
    userId,
  });
  const out: Record<string, string> = {};
  for (const v of vars) {
    out[v.key] = decryptToken(v.value);
  }
  return out;
}

/** Returns a single decrypted value or throws. */
export async function requireUserEnvVar(
  ctx: ActionCtx,
  userId: Id<"users">,
  key: string,
): Promise<string> {
  const all = await resolveUserEnvVars(ctx, userId);
  const val = all[key];
  if (!val) {
    throw new Error(
      `Env var "${key}" is not configured. Set it in Settings → Env Vars.`,
    );
  }
  return val;
}
```

## Frontend (`apps/web/src/`)

### 6. `components/EnvVarsTable.tsx` — reusable inline-edit table

Near-verbatim port of `conductor/apps/web/src/lib/components/EnvVarsTable.tsx`, minus the `sandboxExclude` column + `Excluded from Sandbox` section + `toggleSandboxExclude` props.

Props:

```ts
interface EnvVar {
  key: string;
  value: string;
}
interface EnvVarsTableProps {
  vars: EnvVar[] | undefined;
  onUpsert: (key: string, value: string) => Promise<void>;
  onEdit: (oldKey: string, newKey: string, value?: string) => Promise<void>;
  onReveal: (key: string) => Promise<string | null>;
  onRemove: (key: string) => Promise<void>;
  onBulkImport: (
    entries: Array<{ key: string; value: string }>,
  ) => Promise<void>;
  description: string;
}
```

Behaviour carried over from conductor verbatim:

- "Add Variable" button inserts an editable row at top with Key + Value `Input`s + Save/Cancel icon buttons.
- Each row: Key (mono font, read-only label) · Value (mono, shown as `••••••` by default, replaced by revealed plaintext after eye-click) · Actions (Reveal/Hide, Copy, Edit, Delete).
- Edit mode: the **Value cell** becomes an `Input` for the new value; an additional **Key cell** swap makes that cell editable too (deviation from conductor — user requested both editable). Save triggers `onEdit(oldKey, newKey, newValue || undefined)`.
- Copy: if not yet revealed, calls `onReveal` to fetch plaintext, then writes to clipboard, shows check icon for 1.5s.
- Multi-line paste into the Key input auto-opens the bulk import dialog (`parseEnvVars` helper identical to conductor).
- Delete: opens inline confirmation `Dialog` — no separate file needed.

File stays ≤300 lines (conductor's is ~580 with sandbox logic; trimming it brings this well under the 250-line component ceiling from CLAUDE.md).

### 7. `routes/_main/settings/env-vars.tsx` — page

Thin orchestrator:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import { EnvVarsTable } from "@/components/EnvVarsTable";

export const Route = createFileRoute("/_main/settings/env-vars")({
  component: EnvVarsPage,
});

function EnvVarsPage() {
  const vars = useQuery(api.userEnvVars.list, {});
  const upsert = useAction(api.userEnvVarsActions.upsertVar);
  const edit = useAction(api.userEnvVarsActions.editVar);
  const reveal = useAction(api.userEnvVarsActions.revealValue);
  const remove = useMutation(api.userEnvVars.removeVar);
  const bulkImport = useAction(api.userEnvVarsActions.bulkUpsert);

  return (
    <PageContainer title="Env Vars" centeredMaxWidth>
      <EnvVarsTable
        vars={vars}
        onUpsert={(key, value) => upsert({ key, value })}
        onEdit={(oldKey, newKey, value) => edit({ oldKey, newKey, value })}
        onReveal={(key) => reveal({ key })}
        onRemove={(key) => remove({ key })}
        onBulkImport={(entries) => bulkImport({ entries }).then(() => {})}
        description="Variables (e.g. OPENROUTER_API_KEY) used by server-side actions when calling third-party providers on your behalf. Values are encrypted at rest."
      />
    </PageContainer>
  );
}
```

### 8. `components/sidebar/nav-config.ts` — new entry

Add to `settingsNavItems`, directly below `API Keys`:

```ts
{ href: "/settings/env-vars", label: "Env Vars", icon: IconVariable },
```

Import `IconVariable` from `@tabler/icons-react`.

## Files created / modified

Created:

- `packages/backend/convex/userEnvVars.ts`
- `packages/backend/convex/userEnvVarsActions.ts`
- `packages/backend/convex/lib/envVars.ts`
- `apps/web/src/components/EnvVarsTable.tsx`
- `apps/web/src/routes/_main/settings/env-vars.tsx`

Modified:

- `packages/backend/convex/validators.ts` (add `userEnvVarFields`)
- `packages/backend/convex/schema.ts` (register `userEnvVars`, import field const)
- `apps/web/src/components/sidebar/nav-config.ts` (add entry, import `IconVariable`)

## Constraints honoured

- No `any` / `unknown` / `as` / `!`. Types inferred via `FunctionReturnType<typeof api.userEnvVars.list>` and `Doc<"userEnvVars">` where needed.
- No new dependencies.
- Plaintext never leaves Convex except via explicit `revealValue` action.
- `list` masks server-side — ciphertext never reaches the browser.
- Follows Convex guideline on queries (`withIndex` not `filter`, bounded reads via `.first()`).
- Storage shape matches conductor (single-doc + vars array). Size is bounded in practice; doc-size ceiling is not a risk.
- Tonal surface rules: EnvVarsTable uses `bg-muted/40` container, no borders/shadows on inline rows, destructive `Dialog` (not AlertDialog) for delete.
- Page = thin orchestrator. Table component is reusable.

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — schema + new files typecheck.
2. `cd apps/web && npx tsc --noEmit` — route + table typecheck.
3. Visual end-to-end (user-driven):
   a. `/settings/env-vars` renders empty state.
   b. Click "Add Variable" → inline row appears → enter `OPENROUTER_API_KEY` / `sk-or-...` → Save. Row appears with `••••••`.
   c. Click eye → value reveals. Click again → re-masks. Click copy → clipboard gets real value.
   d. Click pencil → Key cell + Value cell both become inputs. Change key to `OPENROUTER_KEY`, leave value blank → Save. Row renames, reveal still returns original value.
   e. Try adding a second row with key `OPENROUTER_KEY` → upsert overwrites the existing entry (conductor semantics). Confirm via reveal.
   f. Paste a multi-line `.env` block into a new-row Key input → bulk paste dialog opens → Import. Rows appear.
   g. Click trash → confirm → row disappears.
4. Backend smoke (Convex dashboard or throwaway `action`):
   - `internal.userEnvVars.getAllInternal({ userId })` returns encrypted entries.
   - `requireUserEnvVar(ctx, userId, "OPENROUTER_KEY")` → returns plaintext.
   - Same call with missing key → throws the configured error.

## Unresolved questions

- **Crypto module**: plan reuses `lib/crypto.ts` (WebCrypto, `v1:iv:ct`). Conductor uses Node `crypto` (`"use node"`, `enc:` prefix). Reusing existing is simpler and avoids Node-runtime contagion. Swap to Node crypto only if there's a reason to byte-match conductor's stored format. **Recommendation: reuse existing.**
- **Nav label**: plan renames earlier "Secrets" choice to "Env Vars" to match conductor terminology + your original wording ("env vars in the settings page"). **Revert to "Secrets" if you prefer.**
- **Key-rename semantics**: plan treats edit-with-new-key as "delete old entry + insert new" atomically inside one internal mutation. No rehash / migration of downstream consumers needed because consumers look up by the current key literal. Acceptable?
