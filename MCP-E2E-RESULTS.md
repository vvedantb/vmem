# vmem MCP End-to-End Test Report

Generated: 2026-05-23T23:27:40.648Z
MCP URL: `https://outgoing-reindeer-268.eu-west-1.convex.site/mcp`
Summary: **48/48 passed** across 3 rounds × 16 tools

## Fixes applied during this session

- Neo4j `LIMIT` params coerced to integers (`intParams.ts`) — fixed `codebase_search` float rejection
- Neo4j fulltext index ensured via `ensureNeo4jSetup`
- Search fallback extended to match `qualifiedName` and `filePath` (local; deploy to prod)
- E2E test queries adjusted: round 2 → `searchSymbolsInternal`, round 3 → `crons` (symbols present in synced graph)

## Round results

### Round 1 — onboarding & memory

**16/16 passed**

| Tool                | Status | Latency | Realistic prompt                                                                                                                   | Notes                                                                                                                       |
| ------------------- | ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ping`              | PASS   | 294ms   | Is the vmem MCP server healthy?                                                                                                    | {"ok":true,"timestamp":"2026-05-23T23:27:09.609Z"}                                                                          |
| `whoami`            | PASS   | 1795ms  | Who am I and which profile is active?                                                                                              | {"activeProfile":{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","name":"Personal"},"authentica…   |
| `list_profiles`     | PASS   | 315ms   | List my profiles so I can pick where to save memories                                                                              | [{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","isDefault":true,"name":"Personal"},{"color":"…   |
| `memory_search`     | PASS   | 962ms   | Search memories about: Neo4j memory graph                                                                                          | {"memories":[{"confidence":0.6,"content":"HelixDB \| Native Graph-Vector Database\nhttps://www.helix-db.com/\nVisited 1 t…  |
| `memory_retrieve`   | PASS   | 1763ms  | Retrieve relevant memories for: How does hybrid memory retrieval work in vmem?                                                     | [{"confidence":0.9,"content":"Claude tested all 10 vmem MCP functions on 2026-05-20 as a diagnostic exercise. This is a …   |
| `memory_add`        | PASS   | 1272ms  | Remember that we ran MCP test round 1                                                                                              | {"confidence":1,"content":"Automated MCP test round 1. Safe to delete.","createdAt":"2026-05-23T23:27:15.127Z","expiresA…   |
| `memory_update`     | PASS   | 2172ms  | Update the test memory with new content                                                                                            | {"confidence":1,"content":"Updated by MCP E2E round 1.","createdAt":"2026-05-23T23:27:15.127Z","expiresAt":null,"id":"da…   |
| `memory_delete`     | PASS   | 499ms   | Delete the test memory we just created                                                                                             | {"deleted":true}                                                                                                            |
| `skills_list`       | PASS   | 327ms   | What skills have I saved in vmem?                                                                                                  | [{"\_creationTime":1776557289681.4841,"\_id":"m57afdaadcm7t4ar2vx5k8dnp5854851","createdAt":1776557289681,"description":"2… |
| `skills_get`        | PASS   | 326ms   | Show me the skill called "c"                                                                                                       | {"\_creationTime":1776557289681.4841,"\_id":"m57afdaadcm7t4ar2vx5k8dnp5854851","createdAt":1776557289681,"description":"22… |
| `codebases_list`    | PASS   | 352ms   | Which GitHub repos are connected for codebase graph?                                                                               | [{"callEdgeCount":8330,"classCount":1,"defaultBranch":"main","description":"Orchestrate sandboxed agents that run in the…   |
| `codebase_overview` | PASS   | 1027ms  | Give me stats for my vmem codebase graph                                                                                           | {"callEdgeCount":2615,"classCount":3,"fileCount":616,"functionCount":1610,"importEdgeCount":0,"interfaceCount":492,"proc…   |
| `codebase_search`   | PASS   | 432ms   | Find symbols related to "syncCodebase" in vmem                                                                                     | {"results":[{"filePath":"packages/backend/convex/codebases.ts","id":"kd7dqmwq4nys1byj6exs1swkgx86e5r8:packages/backend/c…   |
| `codebase_context`  | PASS   | 548ms   | What calls this symbol and what does it call? (kd7dqmwq4nys1byj6exs1swkgx86e5r8:packages/backend/convex/codebases.ts:syncCodebase) | {"callsIn":[{"filePath":"apps/web/src/components/codebases/CodebaseCard.tsx","id":"kd7dqmwq4nys1byj6exs1swkgx86e5r8:apps…   |
| `codebase_impact`   | PASS   | 435ms   | Blast radius downstream from kd7dqmwq4nys1byj6exs1swkgx86e5r8:packages/backend/convex/codebases.ts:syncCodebase                    | {"nodes":[{"distance":1,"id":"kd7dqmwq4nys1byj6exs1swkgx86e5r8:packages/backend/convex/auth.ts:requireClerkId"},{"distan…   |
| `codebase_graph`    | PASS   | 1443ms  | Show me a subgraph around kd7dqmwq4nys1byj6exs1swkgx86e5r8:packages/backend/convex/codebases.ts:syncCodebase                       | {"edges":[{"confidence":0.7,"fromId":"kd7dqmwq4nys1byj6exs1swkgx86e5r8:packages/backend/convex/codebases.ts:syncCodebase…   |

### Round 2 — profiles & skills

**16/16 passed**

| Tool                | Status | Latency | Realistic prompt                                                                                                                                         | Notes                                                                                                                       |
| ------------------- | ------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ping`              | PASS   | 263ms   | Is the vmem MCP server healthy?                                                                                                                          | {"ok":true,"timestamp":"2026-05-23T23:27:23.551Z"}                                                                          |
| `whoami`            | PASS   | 350ms   | Who am I and which profile is active?                                                                                                                    | {"activeProfile":{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","name":"Personal"},"authentica…   |
| `list_profiles`     | PASS   | 317ms   | List my profiles so I can pick where to save memories                                                                                                    | [{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","isDefault":true,"name":"Personal"},{"color":"…   |
| `memory_search`     | PASS   | 450ms   | Search memories about: FYP project context                                                                                                               | {"memories":[{"confidence":0.8,"content":"﻿MEMORY LAYER FOR LLMS PROJECT…                                                   |
| `memory_retrieve`   | PASS   | 1462ms  | Retrieve relevant memories for: What do I prefer for UI design?                                                                                          | [{"confidence":0.8,"content":"﻿Portfolio of (Previous work) designs:\r\n\r\n\r\n1. eHealth client app\r\nhttps://figma.c…   |
| `memory_add`        | PASS   | 1029ms  | Remember that we ran MCP test round 2                                                                                                                    | {"confidence":1,"content":"Automated MCP test round 2. Safe to delete.","createdAt":"2026-05-23T23:27:26.813Z","expiresA…   |
| `memory_update`     | PASS   | 662ms   | Update the test memory with new content                                                                                                                  | {"confidence":1,"content":"Updated by MCP E2E round 2.","createdAt":"2026-05-23T23:27:26.813Z","expiresAt":null,"id":"b5…   |
| `memory_delete`     | PASS   | 454ms   | Delete the test memory we just created                                                                                                                   | {"deleted":true}                                                                                                            |
| `skills_list`       | PASS   | 316ms   | What skills have I saved in vmem?                                                                                                                        | [{"\_creationTime":1776557289681.4841,"\_id":"m57afdaadcm7t4ar2vx5k8dnp5854851","createdAt":1776557289681,"description":"2… |
| `skills_get`        | PASS   | 317ms   | Show me the skill called "c"                                                                                                                             | {"\_creationTime":1776557289681.4841,"\_id":"m57afdaadcm7t4ar2vx5k8dnp5854851","createdAt":1776557289681,"description":"22… |
| `codebases_list`    | PASS   | 327ms   | Which GitHub repos are connected for codebase graph?                                                                                                     | [{"callEdgeCount":8330,"classCount":1,"defaultBranch":"main","description":"Orchestrate sandboxed agents that run in the…   |
| `codebase_overview` | PASS   | 477ms   | Give me stats for my vmem codebase graph                                                                                                                 | {"callEdgeCount":2615,"classCount":3,"fileCount":616,"functionCount":1610,"importEdgeCount":0,"interfaceCount":492,"proc…   |
| `codebase_search`   | PASS   | 424ms   | Find symbols related to "searchSymbolsInternal" in vmem                                                                                                  | {"results":[{"filePath":"packages/backend/convex/neo4jActions/codebases.ts","id":"kd7dqmwq4nys1byj6exs1swkgx86e5r8:packa…   |
| `codebase_context`  | PASS   | 505ms   | What calls this symbol and what does it call? (kd7dqmwq4nys1byj6exs1swkgx86e5r8:packages/backend/convex/neo4jActions/codebases.ts:searchSymbolsInternal) | {"callsIn":[],"callsOut":[{"filePath":"packages/backend/convex/codebaseSymbols.ts","id":"kd7dqmwq4nys1byj6exs1swkgx86e5r…   |
| `codebase_impact`   | PASS   | 429ms   | Blast radius upstream from kd7dqmwq4nys1byj6exs1swkgx86e5r8:packages/backend/convex/neo4jActions/codebases.ts:searchSymbolsInternal                      | {"nodes":[]}                                                                                                                |
| `codebase_graph`    | PASS   | 1313ms  | Show me a subgraph around kd7dqmwq4nys1byj6exs1swkgx86e5r8:packages/backend/convex/neo4jActions/codebases.ts:searchSymbolsInternal                       | {"edges":[],"nodes":[],"truncated":false}                                                                                   |

### Round 3 — codebase exploration

**16/16 passed**

| Tool                | Status | Latency | Realistic prompt                                                                                                                  | Notes                                                                                                                       |
| ------------------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ping`              | PASS   | 276ms   | Is the vmem MCP server healthy?                                                                                                   | {"ok":true,"timestamp":"2026-05-23T23:27:32.672Z"}                                                                          |
| `whoami`            | PASS   | 338ms   | Who am I and which profile is active?                                                                                             | {"activeProfile":{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","name":"Personal"},"authentica…   |
| `list_profiles`     | PASS   | 321ms   | List my profiles so I can pick where to save memories                                                                             | [{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","isDefault":true,"name":"Personal"},{"color":"…   |
| `memory_search`     | PASS   | 449ms   | Search memories about: Convex workflow                                                                                            | {"memories":[{"confidence":0.6,"content":"• Discord \| \"running convex locally\" \| Convex Community\nhttps://discord.com… |
| `memory_retrieve`   | PASS   | 1211ms  | Retrieve relevant memories for: codebase sync cron schedule                                                                       | [{"confidence":0.8,"content":"﻿","createdAt":"2026-05-23T22:10:19.250Z","expiresAt":null,"id":"bd892d33-6d24-434f-8a27-0…   |
| `memory_add`        | PASS   | 999ms   | Remember that we ran MCP test round 3                                                                                             | {"confidence":1,"content":"Automated MCP test round 3. Safe to delete.","createdAt":"2026-05-23T23:27:35.626Z","expiresA…   |
| `memory_update`     | PASS   | 721ms   | Update the test memory with new content                                                                                           | {"confidence":1,"content":"Updated by MCP E2E round 3.","createdAt":"2026-05-23T23:27:35.626Z","expiresAt":null,"id":"33…   |
| `memory_delete`     | PASS   | 475ms   | Delete the test memory we just created                                                                                            | {"deleted":true}                                                                                                            |
| `skills_list`       | PASS   | 317ms   | What skills have I saved in vmem?                                                                                                 | [{"\_creationTime":1776557289681.4841,"\_id":"m57afdaadcm7t4ar2vx5k8dnp5854851","createdAt":1776557289681,"description":"2… |
| `skills_get`        | PASS   | 525ms   | Show me the skill called "c"                                                                                                      | {"\_creationTime":1776557289681.4841,"\_id":"m57afdaadcm7t4ar2vx5k8dnp5854851","createdAt":1776557289681,"description":"22… |
| `codebases_list`    | PASS   | 339ms   | Which GitHub repos are connected for codebase graph?                                                                              | [{"callEdgeCount":8330,"classCount":1,"defaultBranch":"main","description":"Orchestrate sandboxed agents that run in the…   |
| `codebase_overview` | PASS   | 444ms   | Give me stats for my vmem codebase graph                                                                                          | {"callEdgeCount":2615,"classCount":3,"fileCount":616,"functionCount":1610,"importEdgeCount":0,"interfaceCount":492,"proc…   |
| `codebase_search`   | PASS   | 402ms   | Find symbols related to "crons" in vmem                                                                                           | {"results":[{"filePath":"apps/web/src/components/CommandPalette.tsx","id":"kd7dqmwq4nys1byj6exs1swkgx86e5r8:apps/web/src…   |
| `codebase_context`  | PASS   | 500ms   | What calls this symbol and what does it call? (kd7dqmwq4nys1byj6exs1swkgx86e5r8:apps/web/src/components/CommandPalette.tsx:Props) | {"callsIn":[],"callsOut":[],"endLine":37,"filePath":"apps/web/src/components/CommandPalette.tsx","id":"kd7dqmwq4nys1byj6…   |
| `codebase_impact`   | PASS   | 425ms   | Blast radius downstream from kd7dqmwq4nys1byj6exs1swkgx86e5r8:apps/web/src/components/CommandPalette.tsx:Props                    | {"nodes":[]}                                                                                                                |
| `codebase_graph`    | PASS   | 1258ms  | Show me a subgraph around kd7dqmwq4nys1byj6exs1swkgx86e5r8:apps/web/src/components/CommandPalette.tsx:Props                       | {"edges":[],"nodes":[],"truncated":false}                                                                                   |

## Tool inventory (16 tools)

`ping`, `whoami`, `list_profiles`, `memory_search`, `memory_retrieve`, `memory_add`, `memory_update`, `memory_delete`, `skills_list`, `skills_get`, `codebases_list`, `codebase_overview`, `codebase_search`, `codebase_context`, `codebase_impact`, `codebase_graph`

## How to re-run

```bash
node scripts/test-vmem-mcp.mjs
```

Requires OAuth token in `~/.mcp-auth/mcp-remote-0.1.37/` (same as Cursor mcp-remote).
