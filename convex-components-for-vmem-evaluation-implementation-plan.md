# Convex Components for vmem — Evaluation + Implementation Plan

## Context

User asked: can any of 10 Convex components at convex.dev/components help vmem? After review, user approved adopting **Action Retrier** + **Audit Log** now, Secret Store later, and skipping the rest. This plan covers only the two approved adoptions.

## Scorecard (summary)

| Component                         | Verdict            | Notes                                                                               |
| --------------------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| `@convex-dev/action-retrier`      | **ADOPT NOW**      | Fills a real gap (no retry logic today)                                             |
| `convex-audit-log` (robertalv)    | **ADOPT NOW**      | Replaces short-TTL `memoryEvents` + `apiRequestLogs`, enables proposed-update audit |
| `convex-secret-store` (gaganref)  | **LATER**          | Useful when we revisit `connectorTokens` + BYOK                                     |
| `vllnt/convex-api-keys`           | **DEFER**          | Existing `apiKeys.ts` works; revisit if rotation becomes a need                     |
| `convex-invite-links` (TimpiaAI)  | **SKIP (for now)** | Single-user focus; revisit when team invites are productised                        |
| `djpanda/convex-tenants`          | **SKIP**           | Overlaps `teams`/`profiles`; not worth rewrite                                      |
| `convex-api-tokens` (TimpiaAI)    | **SKIP**           | Redundant with api-keys                                                             |
| `00akshatsinha00/convex-api-keys` | **SKIP**           | Over-engineered for our API surface                                                 |
| `hamzasaleem2/convex-comments`    | **SKIP**           | No comments feature                                                                 |
| `clipin/convex-wearables`         | **SKIP**           | Wrong domain                                                                        |

---

## Phase 1 — Action Retrier

### Why

External calls today are single-shot. Failures on flaky networks = user-visible errors with no retry:

- Neo4j actions (`packages/backend/convex/neo4jActions/memories.ts`, `enrichment.ts`, `graph.ts`, `relationships.ts`, `timeline.ts`, `connectorSync.ts`, `codebases.ts`, `mcp.ts`, `dashboard.ts`, `proposedUpdates.ts`, `dbSetup.ts`, `migration.ts`)
- OpenRouter embedding/LLM calls (wherever actions hit OpenRouter)
- Connector sync actions (Google Drive / Notion / Gmail)

### Install

1. `npm install @convex-dev/action-retrier` in `packages/backend`
2. `packages/backend/convex/convex.config.ts`:
   ```ts
   import actionRetrier from "@convex-dev/action-retrier/convex.config";
   app.use(actionRetrier);
   ```
3. New file `packages/backend/convex/retrier.ts`:
   ```ts
   import { ActionRetrier } from "@convex-dev/action-retrier";
   import { components } from "./_generated/api";
   export const retrier = new ActionRetrier(components.actionRetrier, {
     initialBackoffMs: 500,
     base: 2,
     maxFailures: 4,
   });
   ```

### Where to wrap

Not every action — only the ones that touch an external service. Identify callsites that invoke Neo4j driver, OpenRouter fetch, or connector APIs. Replace:

```ts
await ctx.runAction(internal.neo4jActions.memories.createMemory, args);
```

with:

```ts
await retrier.run(ctx, internal.neo4jActions.memories.createMemory, args);
```

### Idempotency check (important)

`retrier` assumes the action is **idempotent**. Audit each retried action:

- `neo4jActions/memories.createMemory` — needs idempotency key or MERGE on memoryId to avoid duplicate nodes on retry
- `neo4jActions/relationships.*` — MERGE already handles it
- `neo4jActions/enrichment.*` — check whether re-running enrichment on same memory is safe
- OpenRouter calls — idempotent (read-only) for embeddings; LLM calls should be safe since we persist result only on success

Anything not idempotent stays un-wrapped for now.

### No schema changes, no UI changes

---

## Phase 2 — Audit Log

### Why

Today's audit surface is split and fragile:

- `memoryEvents` table: 5-minute retention, manual event types, no diff, no actor beyond clerkId
- `apiRequestLogs` table: separate, different shape
- Proposed-update approve/reject: no audit trail (called out in CLAUDE.md as a core differentiator)
- Team role changes, connector OAuth connect/disconnect, API key create/revoke: no audit today
- Memory lifecycle ("pin, suppress, expire, audit trail") is an explicit product differentiator

### Install

1. `npm install convex-audit-log`
2. `packages/backend/convex/convex.config.ts`:
   ```ts
   import auditLog from "convex-audit-log/convex.config.js";
   app.use(auditLog);
   ```
3. New file `packages/backend/convex/auditLog.ts`:
   ```ts
   import { AuditLog } from "convex-audit-log";
   import { components } from "./_generated/api";
   export const auditLog = new AuditLog(components.auditLog, {
     piiFields: [
       "email",
       "phone",
       "accessToken",
       "refreshToken",
       "encryptedKey",
     ],
   });
   ```

### Migration strategy (per CLAUDE.md rule)

**Step A — add, don't remove.** Component lives alongside `memoryEvents` and `apiRequestLogs`. New writes go to both for one deploy cycle.

**Step B — backfill + cut reads over.**

- Backfill: one-shot migration mutation reading `memoryEvents` + `apiRequestLogs` and re-emitting via `auditLog.log`.
- Update `apps/web/src/routes/_main/activity.tsx` + `apiLogs.ts` consumers to query `auditLog.queryByActor` / `queryByResource`.

**Step C — stop double-writing, drop old tables.**

- Remove `ctx.db.insert("memoryEvents", …)` from `memoryEvents.ts` (keep the module signature as a thin wrapper over `auditLog.log` so existing HTTP/internal callers don't break).
- Remove `apiRequestLogs` inserts.
- Delete `memoryEvents` + `apiRequestLogs` tables from `schema.ts`.
- Delete migration function after run (per CLAUDE.md).

### Call sites to add audit logging

1. **Memory lifecycle** (replace current `memoryEvents`): `packages/backend/convex/memoryEvents.ts` → all `pushEvent` / `pushEventInternal` callers
2. **Proposed updates** (NEW audit trail): `packages/backend/convex/proposedUpdateApi.ts` — approve, reject, with actor + before/after
3. **API keys** (NEW audit): `packages/backend/convex/apiKeys.ts` — create, revoke, name changes, severity `warning` on revoke
4. **Team membership** (NEW audit): `packages/backend/convex/teams.ts` — add member, remove member, role change
5. **Profiles** (NEW audit): create, delete, rename
6. **Connectors** (NEW audit): connect, disconnect, sync error — use severity `error` for failures
7. **HTTP API requests** (replace `apiRequestLogs`): wherever we record request/status today — use `resourceType: "api_request"`, severity mapped from status code (2xx→info, 4xx→warning, 5xx→error)

### Schema changes (after cutover)

- `packages/backend/convex/schema.ts` — remove `memoryEvents` table (lines 23-34) and `apiRequestLogs` table (lines 130-140)

### UI changes

- `apps/web/src/routes/_main/activity.tsx` — point at `auditLog.queryByActor`
- `apps/web/src/routes/_main/settings/api-keys/*` — swap `apiLogs.listMy` usage for `auditLog.queryByResource({resourceType:"api_request", …})`

### PII safety

`piiFields` config auto-redacts: `email`, `phone`, `accessToken`, `refreshToken`, `encryptedKey`. Verify no raw API keys leak into `before`/`after` payloads.

---

## Proposed Order & Size

1. **Retrier** — ~1 afternoon. Isolated, low risk. Ship first.
2. **Audit Log** — ~1–2 days incl. migration. Ship after Retrier is green.
3. **Secret Store** — schedule later when we revisit `connectorTokens` + any user-provided BYOK model keys.

---

## Critical Files

Phase 1 (Retrier):

- `packages/backend/convex/convex.config.ts` (register)
- `packages/backend/convex/retrier.ts` (new, client)
- `packages/backend/convex/neo4jActions/*.ts` (wrap external-service callers only)
- Any file calling OpenRouter via `fetch` inside an action

Phase 2 (Audit Log):

- `packages/backend/convex/convex.config.ts` (register)
- `packages/backend/convex/auditLog.ts` (new, client)
- `packages/backend/convex/memoryEvents.ts` (thin wrapper → audit log, then delete)
- `packages/backend/convex/apiLogs.ts` (point at audit log, then delete)
- `packages/backend/convex/proposedUpdateApi.ts` (add approve/reject audit)
- `packages/backend/convex/apiKeys.ts` (add create/revoke audit)
- `packages/backend/convex/teams.ts` (add membership audit)
- `packages/backend/convex/schema.ts` (drop `memoryEvents` + `apiRequestLogs` after backfill)
- `apps/web/src/routes/_main/activity.tsx` (swap data source)
- `apps/web/src/routes/_main/settings/api-keys/*` (swap data source)

---

## Verification (end-to-end)

Phase 1:

- Stop Neo4j locally → trigger a memory create from web UI → retrier shows 4 attempts with 0.5s/1s/2s/4s backoff in logs → final error surfaced after exhaustion
- Start Neo4j mid-retry → action succeeds on the recovered attempt, memory appears

Phase 2:

- Create memory in web UI → `/activity` shows entry with actor, `resourceType:"memory"`, `severity:"info"`, diff `before:null → after:{…}`
- Approve a proposed update → audit entry logged (visible in `/activity`)
- Create + revoke an API key → two audit entries, revoke at `severity:"warning"`
- Hit HTTP API endpoint with bad key → audit entry `resourceType:"api_request"`, `severity:"warning"`, 401 status
- Export last 7 days audit to CSV via `auditLog.export` — confirm PII fields redacted

Type check both phases:

```
cd packages/backend && npx convex codegen --typecheck enable
```

---

## Out of scope (explicitly deferred)

- Secret Store migration of `connectorTokens` / `githubConnections.encryptedAccessToken` — revisit when BYOK or broader secret management is prioritized
- Replacing `apiKeys.ts` with `vllnt/convex-api-keys` — revisit if rotation / grace period / bulk revoke become requirements
- Invite links, tenants, comments, wearables, api-tokens, akshatsinha api-keys — not adopted
