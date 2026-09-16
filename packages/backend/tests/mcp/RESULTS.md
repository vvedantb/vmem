# MCP live + retrieval quality report

Generated: 2026-09-16

Live site: `https://clear-bear-690.eu-west-1.convex.site`

## How to re-run

```bash
# Always-on in-process harness (every tool path + labelled ranker)
pnpm --filter @vmem/backend test:mcp

# Live unauth probes (health, OAuth metadata, 401s)
RUN_MCP_LIVE=1 pnpm --filter @vmem/backend test:mcp-live

# Authenticated live tools (Clerk OAuth access token, not a session JWT)
RUN_MCP_LIVE=1 MCP_BEARER_TOKEN='<clerk oauth_token>' pnpm --filter @vmem/backend test:mcp-live
```

CI runs the unauth live probes. Authenticated tool CRUD stays skipped until `MCP_BEARER_TOKEN` is set.

## Live gap

MCP `verifyAccessToken` accepts only Clerk `oauth_token` (`packages/backend/convex/mcp/nodeActions.ts`). This environment has no Clerk OAuth client secret, no mint helper, and no `MCP_BEARER_TOKEN`. Interactive OAuth for `eva@vedantb.com` was not available.

Unauthenticated live probes ran against production. Authenticated tool calls used the in-process JSON-RPC harness that dispatches the same `toolSpecs` / `memory_graph` handlers.

## Catalog / auth

| Check                                                     | Live                     | In-process |
| --------------------------------------------------------- | ------------------------ | ---------- |
| `GET /health` → `{ status: "ok" }`                        | pass                     | n/a        |
| `/.well-known/oauth-protected-resource` personal + team   | pass                     | n/a        |
| `/.well-known/oauth-authorization-server` (Clerk AS)      | pass                     | n/a        |
| POST `/mcp` missing bearer → 401 + WWW-Authenticate       | pass                     | pass       |
| POST `/mcp` invalid bearer → 401                          | pass                     | pass       |
| POST `/mcp/team` missing bearer → 401 (team metadata URL) | pass                     | pass       |
| Valid token → initialize + `tools/list`                   | blocked (no OAuth token) | pass       |
| No codebase / github / neo4j tools                        | catalog unit test        | pass       |

Personal catalog (22 tools + `memory_graph`): ping, whoami, list_profiles, set_active_profile, context_prompt_get, 7 memory tools, 5 skills, 6 wiki, 4 files, memory_graph.

Team catalog: core minus `context_prompt_get`, all memory tools, memory_graph. Skills / wiki / files are personal-only.

## Tool pass/fail matrix

| Tool                                                | Happy path                               | Bad args                       | Live (token) |
| --------------------------------------------------- | ---------------------------------------- | ------------------------------ | ------------ |
| ping                                                | pass                                     | n/a (empty schema)             | skipped      |
| whoami                                              | pass                                     | n/a                            | skipped      |
| list_profiles                                       | pass                                     | n/a                            | skipped      |
| set_active_profile                                  | pass                                     | pass (missing profileId)       | skipped      |
| context_prompt_get                                  | pass (personal); hidden on team          | n/a                            | skipped      |
| memory_search                                       | pass                                     | pass (limit 0)                 | skipped      |
| memory_retrieve                                     | pass (pnpm ranks above coffee)           | pass (missing query, limit 99) | skipped      |
| memory_add                                          | pass                                     | pass (incomplete body)         | skipped      |
| memory_add_instruction                              | pass (`openrouter_required` without key) | pass (missing instruction)     | skipped      |
| memory_update                                       | pass                                     | pass (missing id)              | skipped      |
| memory_delete                                       | pass                                     | pass (missing id)              | skipped      |
| memory_related                                      | pass                                     | pass (missing memoryId)        | skipped      |
| memory_graph                                        | pass                                     | n/a                            | skipped      |
| skills_list / get / create / update / delete        | pass                                     | pass                           | skipped      |
| wiki_list / get / search / create / update / delete | pass                                     | pass                           | skipped      |
| files_list / get / upload / delete                  | pass                                     | pass                           | skipped      |

## Retrieval quality

MCP `memory_retrieve` → `retrieveMemoriesForClerk` / `retrieveMemoriesForTeamProfile` → `retrieveMemoriesFromPool` → `rankMemories`. The labelled eval drives that same `rankMemories` (`packages/backend/eval/retrieve.ts`).

Embeddings in this run: **synthetic** (`OPENROUTER_API_KEY` not set locally). Neo4j 2026-07-18 used OpenRouter `text-embedding-3-small`.

| Metric    | Neo4j full hybrid (bar) | Convex / MCP ranker | vs bar   |
| --------- | ----------------------- | ------------------- | -------- |
| recall@1  | 72.4%                   | 75.6%               | pass     |
| recall@3  | 90.1%                   | 97.1%               | pass     |
| recall@5  | **92.0%**               | **99.4%**           | **pass** |
| recall@10 | 93.3%                   | 100.0%              | pass     |
| MRR       | **0.974**               | **0.994**           | **pass** |
| nDCG@10   | **0.857**               | **0.968**           | **pass** |

Full hybrid also beats hybrid-without-graph on nDCG@10 (0.968 vs 0.854) and on multi-hop / project types. Success criterion (R@5, MRR, nDCG@10 ≥ Neo4j) **pass**.
