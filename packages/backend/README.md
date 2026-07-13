# @vmem/backend

Convex backend for vmem. Auth, profiles, teams, skills, MCP HTTP, and file storage live here. The memory graph itself is in Neo4j, accessed via `neo4jActions/*` internal actions.

## Architecture

```
Client (web / extension / mobile / MCP)
  → Convex authAction / authMutation / authQuery
  → neo4jActions/* (Node actions)
  → Neo4j memory graph
```

Public HTTP routes (MCP, OAuth, health) are registered in `convex/http.ts` on the deployment's `.convex.site` origin.

## Schema (Convex tables)

Memories are **not** stored in Convex — they live in Neo4j. Convex holds metadata, auth, and app state:

| Table                                     | Description                                |
| ----------------------------------------- | ------------------------------------------ |
| `users`                                   | Clerk-linked user records                  |
| `apiKeys`                                 | API keys — AES-GCM encrypted at rest       |
| `profiles`                                | Personal and team memory profiles          |
| `teams` / `teamMembers`                   | Team membership                            |
| `skills`                                  | Reusable instruction modules               |
| `wikiNodes`                               | Personal wiki tree                         |
| `codebases`                               | Connected GitHub repositories              |
| `connectors` / `connectorTokens`          | External service integrations              |
| `userSettings`                            | Preferences, about me, active profile      |
| `chatMessageMemoryRefs`                   | Memory refs persisted under chat messages  |
| `contextPromptCache`                      | Cached MCP context prompt markdown         |
| `notifications`                           | In-app notifications                       |
| `userEnvVars`                             | User-scoped env vars (e.g. OpenRouter key) |
| `openRouterLogs`                          | LLM/embedding call audit trail             |
| `mcpAuthCodes` / `mcpClientRegistrations` | MCP OAuth state                            |

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
| `mcp/`                                   | MCP tools, resources, OAuth, JWT                                      |
| `neo4jActions/`                          | Node actions wrapping Neo4j memory service                            |

## Auth builders

All protected functions use builders from `auth.ts` rather than raw `query`/`mutation`/`action`. These verify the Clerk identity and inject `ctx.userId` as a Convex `Id<"users">`.

```ts
import { authQuery, authMutation, authAction } from "./auth";
```

## Environment

Set in the Convex dashboard (not `.env`):

| Variable                          | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `ENCRYPTION_KEY`                  | AES-256 key for API keys and OAuth tokens |
| `CLERK_FRONTEND_API_URL`          | Clerk JWKS for Convex auth                |
| `CLERK_SECRET_KEY`                | MCP OAuth                                 |
| `MCP_JWT_SECRET`                  | MCP Bearer token signing                  |
| `NEO4J_URI` / `NEO4J_PASSWORD`    | Memory graph                              |
| `CONVEX_SITE_URL` / `WEB_APP_URL` | OAuth redirects                           |
| `OPENROUTER_API_KEY`              | Embeddings and context prompt generation  |

Neo4j CLI scripts (`db:seed:bench`, `db:tag-stats`, `eval:bench`) use `packages/backend/.env.local`.

## Run

```bash
pnpm --filter @vmem/backend dev
```

Typecheck without a running dev server:

```bash
cd packages/backend && npx convex codegen --typecheck enable
```
