<!-- AI-generated (Claude), prompt: "document the vmem convex backend package" -->
<!-- Modified by me: tightened architecture and module overview -->

# @vmem/backend

Convex backend for vmem. Auth, profiles, teams, skills, MCP HTTP, files, connectors, and memories live here. Memory CRUD, search, and retrieve run on the Convex `memories` table.

## Architecture

```
Client (web / extension / MCP)
  → Convex authAction / authMutation / authQuery
  → memoryStore (Convex memories table)
```

Public HTTP routes (MCP, OAuth, health) are registered in `convex/http.ts` on the deployment's `.convex.site` origin.

## Schema (Convex tables)

Memories are stored in Convex (`memories`). Convex also holds metadata, auth, and app state:

| Table                            | Description                                |
| -------------------------------- | ------------------------------------------ |
| `users`                          | Clerk-linked user records                  |
| `apiKeys`                        | API keys — AES-GCM encrypted at rest       |
| `profiles`                       | Personal and team memory profiles          |
| `teams` / `teamMembers`          | Team membership                            |
| `skills`                         | Reusable instruction modules               |
| `wikiNodes`                      | Personal wiki tree                         |
| `memories`                       | Memory CRUD, search, and retrieve          |
| `proposedUpdates`                | Inbox merge/update proposals               |
| `connectors` / `connectorTokens` | External service integrations              |
| `userSettings`                   | Preferences, about me, active profile      |
| `contextPromptCache`             | Cached MCP context prompt markdown         |
| `notifications`                  | In-app notifications                       |
| `userEnvVars`                    | User-scoped env vars (e.g. OpenRouter key) |
| `openRouterLogs`                 | LLM/embedding call audit trail             |

Audit trails (memory lifecycle, API key events, proposed-update resolutions) live in the `convex-audit-log` component — see `auditLog.ts`.

## Key modules

| Module                                   | Description                                                           |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `auth.ts`                                | `ensureUserExists`, `me`, `authQuery` / `authMutation` / `authAction` |
| `memoryApi.ts`                           | Personal + team memory CRUD, search, retrieve, events                 |
| `proposedUpdateApi.ts`                   | List and resolve memory proposals                                     |
| `dashboardApi.ts`                        | Stats and recent activity                                             |
| `profiles.ts` / `teams.ts` / `skills.ts` | Profile, team, and skill management                                   |
| `fileImport.ts`                          | PDF/text/image memory import                                          |
| `contextPromptApi.ts`                    | Synthesized user profile for MCP                                      |
| `apiKeys.ts`                             | Create, list, revoke, reveal API keys                                 |
| `mcp/`                                   | MCP tools, resources, Clerk OAuth token verify                        |
| `memoryStore/`                           | Convex memory table helpers and internals                             |

## Auth builders

All protected functions use builders from `auth.ts` rather than raw `query`/`mutation`/`action`. These verify the Clerk identity and inject `ctx.userId` as a Convex `Id<"users">`.

```ts
import { authQuery, authMutation, authAction } from "./auth";
```

## Environment

Use `.env.example` as the complete template. Copy it to `.env.local` for local CLI scripts/tests, and set the Convex runtime variables in the Convex dashboard:

| Variable                          | Purpose                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`                  | AES-256 key for API keys and OAuth tokens                                                |
| `CLERK_FRONTEND_API_URL`          | Clerk JWKS + MCP AS discovery                                                            |
| `CLERK_SECRET_KEY`                | Clerk Backend API / MCP token verify                                                     |
| `CLERK_PUBLISHABLE_KEY`           | MCP OAuth token verify (`authenticateRequest`)                                           |
| `CONVEX_SITE_URL` / `WEB_APP_URL` | OAuth redirects / resource docs                                                          |
| `OPENROUTER_API_KEY`              | Embeddings and context prompt generation                                                 |
| `TYPESAFE_API_KEY`                | Jev retrieve-gate and Dream Mode merge gate (on when set; retrieve `judge: "off"` skips) |
| `MEM0_API_KEY`                    | Optional labelled IR vs Mem0 (`eval:competitive`)                                        |
| `SUPERMEMORY_API_KEY`             | Optional labelled IR vs SuperMemory (`eval:competitive`)                                 |

Live HTTP tests use `packages/backend/.env.local`.

## Run

```bash
pnpm --filter @vmem/backend dev
```

Typecheck without a running dev server:

```bash
cd packages/backend && npx convex codegen --typecheck enable
```

Labelled retrieve eval (IR, no LLM judge): `pnpm --filter @vmem/backend eval:bench`. Default-on Jev vs hybrid-only (`judge: "off"`) on that harness: `EVAL_JEV=1 pnpm --filter @vmem/backend eval:jev` (needs `TYPESAFE_API_KEY`; does not mock). Labelled IR vs Mem0 / SuperMemory: `EVAL_COMPETITIVE=1 pnpm --filter @vmem/backend eval:competitive` (needs `MEM0_API_KEY` + `SUPERMEMORY_API_KEY`; see `tests/memory/competitive/vmem-vs-mem0-supermemory.md`). LoCoMo utterance-IR (download `locomo10.json`, no OpenAI/judge): `pnpm --filter @vmem/backend eval:locomo-ir` (default `-l` 8; see `tests/memory/competitive/memorybench-ir-port.md`). SuperMemory / Mem0 gap analysis and Convex-only roadmap: `tests/memory/competitive-brief.md`. TypeSafe Jev retrieve-gate: `tests/memory/jev-retrieve-gate.md`.
