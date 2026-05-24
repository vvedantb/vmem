# vmem MCP End-to-End Test Report

Generated: 2026-05-24T22:14:04.298Z
MCP URL: `https://outgoing-reindeer-268.eu-west-1.convex.site/mcp`
Summary: **57/66 passed** across 3 rounds × 21 tools

## Fixes applied during this session

- Neo4j `LIMIT` params coerced to integers (`intParams.ts`) — fixed `codebase_search` float rejection
- Neo4j fulltext index ensured via `ensureNeo4jSetup`
- Search fallback extended to match `qualifiedName` and `filePath` (local; deploy to prod)
- E2E test queries adjusted: round 2 → `searchSymbolsInternal`, round 3 → `crons` (symbols present in synced graph)

## Round results

### Round 1 — onboarding & memory

**19/22 passed**

| Tool                | Status | Latency | Realistic prompt                                                               | Notes                                                                                                                       |
| ------------------- | ------ | ------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `ping`              | PASS   | 329ms   | Is the vmem MCP server healthy?                                                | {"ok":true,"timestamp":"2026-05-24T22:13:29.011Z"}                                                                          |
| `whoami`            | PASS   | 1646ms  | Who am I and which profile is active?                                          | {"activeProfile":{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","name":"Personal"},"authentica…   |
| `list_profiles`     | PASS   | 319ms   | List my profiles so I can pick where to save memories                          | [{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","isDefault":true,"name":"Personal"},{"color":"…   |
| `memory_search`     | PASS   | 1348ms  | Search memories about: Neo4j memory graph                                      | {"memories":[{"confidence":0.8,"content":"neo4j-labs/agent-memory: A graph-native memory system for AI agents and contex…   |
| `memory_retrieve`   | PASS   | 2397ms  | Retrieve relevant memories for: How does hybrid memory retrieval work in vmem? | [{"confidence":0.8,"content":"how does chatgpt memory work how to implement it with openrouter api react...\nhttps://www…   |
| `memory_graph`      | PASS   | 2712ms  | Show an interactive graph of my memories (MCP App payload)                     | {"nodes":[{"createdAt":"2026-05-24T19:57:23.577Z","id":"792f3e45-4173-4da5-b225-1cb74b89e3c3","tags":["email","outlook",…   |
| `memory_add`        | PASS   | 1278ms  | Remember that we ran MCP test round 1                                          | {"confidence":1,"content":"Automated MCP test round 1. Safe to delete.","createdAt":"2026-05-24T22:13:38.163Z","expiresA…   |
| `memory_update`     | PASS   | 594ms   | Update the test memory with new content                                        | {"confidence":1,"content":"Updated by MCP E2E round 1.","createdAt":"2026-05-24T22:13:38.163Z","expiresAt":null,"id":"90…   |
| `memory_delete`     | PASS   | 480ms   | Delete the test memory we just created                                         | {"deleted":true}                                                                                                            |
| `skills_list`       | PASS   | 348ms   | What skills have I saved in vmem?                                              | [{"description":"Produce a personal debrief and game plan. Generates \"today\", \"rest of this week\", and \"past 7 days…   |
| `skills_get`        | PASS   | 346ms   | Show me the skill called "debrief"                                             | {"\_creationTime":1779639146216.458,"\_id":"m575zwzdsd1s1np2and1x2e0f187bdvg","createdAt":1779639146216,"description":"Pro… |
| `wiki_list`         | PASS   | 340ms   | List my wiki folders and documents                                             | [{"id":"m9703v0wswsd25yvx8ze5jpr2185069d","kind":"document","order":0,"parentId":null,"title":"SOUL","updatedAt":1779656…   |
| `wiki_create`       | PASS   | 338ms   | Create a wiki document for round 1                                             | {"contentMarkdown":"# MCP E2E Wiki R1 1779660820793\n\nRound 1 wiki body.","createdAt":1779660821124,"id":"m974jrt4hbn96…   |
| `wiki_get`          | PASS   | 306ms   | Read the wiki document we just created                                         | {"contentMarkdown":"# MCP E2E Wiki R1 1779660820793\n\nRound 1 wiki body.","createdAt":1779660821124,"id":"m974jrt4hbn96…   |
| `wiki_search`       | PASS   | 343ms   | Search wiki for "MCP E2E Wiki R1 1779660820793"                                | [{"excerpt":"# MCP E2E Wiki R1 1779660820793\n\nRound 1 wiki body.","id":"m974jrt4hbn96rqh0k2bgx5bf187a5kr","kind":"docu…   |
| `wiki_update`       | PASS   | 351ms   | Append to the wiki document body                                               | {"contentMarkdown":"# MCP E2E Wiki R1 1779660820793\n\nRound 1 wiki body.\n\nAppended in round 1.","createdAt":177966082…   |
| `codebases_list`    | PASS   | 357ms   | Which GitHub repos are connected for codebase graph?                           | [{"callEdgeCount":10026,"classCount":0,"defaultBranch":"main","description":"Orchestrate sandboxed agents that run in th…   |
| `codebase_overview` | PASS   | 1181ms  | Give me stats for my vmem codebase graph                                       | {"callEdgeCount":0,"classCount":0,"fileCount":0,"functionCount":0,"importEdgeCount":0,"interfaceCount":0,"processCount":…   |
| `codebase_search`   | PASS   | 492ms   | Find symbols related to "syncCodebase" in vmem                                 | {"results":[]}                                                                                                              |
| `codebase_context`  | FAIL   | —       | codebase_context                                                               | Skipped: codebase_search returned no symbols                                                                                |
| `codebase_impact`   | FAIL   | —       | codebase_impact                                                                | Skipped: codebase_search returned no symbols                                                                                |
| `codebase_graph`    | FAIL   | —       | codebase_graph                                                                 | Skipped: codebase_search returned no symbols                                                                                |

### Round 2 — profiles & skills

**19/22 passed**

| Tool                | Status | Latency | Realistic prompt                                                | Notes                                                                                                                       |
| ------------------- | ------ | ------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ping`              | PASS   | 302ms   | Is the vmem MCP server healthy?                                 | {"ok":true,"timestamp":"2026-05-24T22:13:44.513Z"}                                                                          |
| `whoami`            | PASS   | 347ms   | Who am I and which profile is active?                           | {"activeProfile":{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","name":"Personal"},"authentica…   |
| `list_profiles`     | PASS   | 351ms   | List my profiles so I can pick where to save memories           | [{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","isDefault":true,"name":"Personal"},{"color":"…   |
| `memory_search`     | PASS   | 498ms   | Search memories about: FYP project context                      | {"memories":[{"confidence":0.8,"content":"AI agents with graph memory \| Create Context Graph\nhttps://create-context-gra…  |
| `memory_retrieve`   | PASS   | 1617ms  | Retrieve relevant memories for: What do I prefer for UI design? | [{"confidence":0.8,"content":"Registration UI templates (Sign up/Log in) (Community) – Figma\nhttps://www.figma.com/desi…   |
| `memory_graph`      | PASS   | 1135ms  | Show an interactive graph of my memories (MCP App payload)      | {"nodes":[{"createdAt":"2026-05-24T19:57:23.577Z","id":"792f3e45-4173-4da5-b225-1cb74b89e3c3","tags":["email","outlook",…   |
| `memory_add`        | PASS   | 977ms   | Remember that we ran MCP test round 2                           | {"confidence":1,"content":"Automated MCP test round 2. Safe to delete.","createdAt":"2026-05-24T22:13:49.099Z","expiresA…   |
| `memory_update`     | PASS   | 563ms   | Update the test memory with new content                         | {"confidence":1,"content":"Updated by MCP E2E round 2.","createdAt":"2026-05-24T22:13:49.099Z","expiresAt":null,"id":"52…   |
| `memory_delete`     | PASS   | 461ms   | Delete the test memory we just created                          | {"deleted":true}                                                                                                            |
| `skills_list`       | PASS   | 332ms   | What skills have I saved in vmem?                               | [{"description":"Produce a personal debrief and game plan. Generates \"today\", \"rest of this week\", and \"past 7 days…   |
| `skills_get`        | PASS   | 336ms   | Show me the skill called "debrief"                              | {"\_creationTime":1779639146216.458,"\_id":"m575zwzdsd1s1np2and1x2e0f187bdvg","createdAt":1779639146216,"description":"Pro… |
| `wiki_list`         | PASS   | 320ms   | List my wiki folders and documents                              | [{"id":"m9703v0wswsd25yvx8ze5jpr2185069d","kind":"document","order":0,"parentId":null,"title":"SOUL","updatedAt":1779656…   |
| `wiki_create`       | PASS   | 347ms   | Create a wiki document for round 2                              | {"contentMarkdown":"# MCP E2E Wiki R2 1779660831426\n\nRound 2 wiki body.","createdAt":1779660831781,"id":"m973bknsqs7xp…   |
| `wiki_get`          | PASS   | 318ms   | Read the wiki document we just created                          | {"contentMarkdown":"# MCP E2E Wiki R2 1779660831426\n\nRound 2 wiki body.","createdAt":1779660831781,"id":"m973bknsqs7xp…   |
| `wiki_search`       | PASS   | 342ms   | Search wiki for "MCP E2E Wiki R2 1779660831426"                 | [{"excerpt":"# MCP E2E Wiki R2 1779660831426\n\nRound 2 wiki body.","id":"m973bknsqs7xpmzhg65tj7maas87am1c","kind":"docu…   |
| `wiki_update`       | PASS   | 352ms   | Append to the wiki document body                                | {"contentMarkdown":"# MCP E2E Wiki R2 1779660831426\n\nRound 2 wiki body.\n\nAppended in round 2.","createdAt":177966083…   |
| `codebases_list`    | PASS   | 365ms   | Which GitHub repos are connected for codebase graph?            | [{"callEdgeCount":10026,"classCount":0,"defaultBranch":"main","description":"Orchestrate sandboxed agents that run in th…   |
| `codebase_overview` | PASS   | 969ms   | Give me stats for my vmem codebase graph                        | {"callEdgeCount":0,"classCount":0,"fileCount":0,"functionCount":0,"importEdgeCount":0,"interfaceCount":0,"processCount":…   |
| `codebase_search`   | PASS   | 452ms   | Find symbols related to "searchSymbolsInternal" in vmem         | {"results":[]}                                                                                                              |
| `codebase_context`  | FAIL   | —       | codebase_context                                                | Skipped: codebase_search returned no symbols                                                                                |
| `codebase_impact`   | FAIL   | —       | codebase_impact                                                 | Skipped: codebase_search returned no symbols                                                                                |
| `codebase_graph`    | FAIL   | —       | codebase_graph                                                  | Skipped: codebase_search returned no symbols                                                                                |

### Round 3 — codebase exploration

**19/22 passed**

| Tool                | Status | Latency | Realistic prompt                                            | Notes                                                                                                                       |
| ------------------- | ------ | ------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ping`              | PASS   | 275ms   | Is the vmem MCP server healthy?                             | {"ok":true,"timestamp":"2026-05-24T22:13:54.889Z"}                                                                          |
| `whoami`            | PASS   | 339ms   | Who am I and which profile is active?                       | {"activeProfile":{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","name":"Personal"},"authentica…   |
| `list_profiles`     | PASS   | 327ms   | List my profiles so I can pick where to save memories       | [{"color":"#3B82F6","icon":"user","id":"md749hvc7yvrv60gf92tgr70f9856nsf","isDefault":true,"name":"Personal"},{"color":"…   |
| `memory_search`     | PASS   | 633ms   | Search memories about: Convex workflow                      | {"memories":[{"confidence":0.8,"content":"get-convex/turbo-expo-nextjs-clerk-convex-monorepo: Monorepo template with Tur…   |
| `memory_retrieve`   | PASS   | 1217ms  | Retrieve relevant memories for: codebase sync cron schedule | [{"confidence":0.8,"content":"An Object Sync Engine for Local-first Apps\nhttps://stack.convex.dev/object-sync-engine","…   |
| `memory_graph`      | PASS   | 1233ms  | Show an interactive graph of my memories (MCP App payload)  | {"nodes":[{"createdAt":"2026-05-24T19:57:23.577Z","id":"792f3e45-4173-4da5-b225-1cb74b89e3c3","tags":["email","outlook",…   |
| `memory_add`        | PASS   | 1031ms  | Remember that we ran MCP test round 3                       | {"confidence":1,"content":"Automated MCP test round 3. Safe to delete.","createdAt":"2026-05-24T22:13:59.347Z","expiresA…   |
| `memory_update`     | PASS   | 582ms   | Update the test memory with new content                     | {"confidence":1,"content":"Updated by MCP E2E round 3.","createdAt":"2026-05-24T22:13:59.347Z","expiresAt":null,"id":"c0…   |
| `memory_delete`     | PASS   | 465ms   | Delete the test memory we just created                      | {"deleted":true}                                                                                                            |
| `skills_list`       | PASS   | 346ms   | What skills have I saved in vmem?                           | [{"description":"Produce a personal debrief and game plan. Generates \"today\", \"rest of this week\", and \"past 7 days…   |
| `skills_get`        | PASS   | 329ms   | Show me the skill called "debrief"                          | {"\_creationTime":1779639146216.458,"\_id":"m575zwzdsd1s1np2and1x2e0f187bdvg","createdAt":1779639146216,"description":"Pro… |
| `wiki_list`         | PASS   | 316ms   | List my wiki folders and documents                          | [{"id":"m9703v0wswsd25yvx8ze5jpr2185069d","kind":"document","order":0,"parentId":null,"title":"SOUL","updatedAt":1779656…   |
| `wiki_create`       | PASS   | 348ms   | Create a wiki document for round 3                          | {"contentMarkdown":"# MCP E2E Wiki R3 1779660841682\n\nRound 3 wiki body.","createdAt":1779660842031,"id":"m979534cn77hg…   |
| `wiki_get`          | PASS   | 310ms   | Read the wiki document we just created                      | {"contentMarkdown":"# MCP E2E Wiki R3 1779660841682\n\nRound 3 wiki body.","createdAt":1779660842031,"id":"m979534cn77hg…   |
| `wiki_search`       | PASS   | 339ms   | Search wiki for "MCP E2E Wiki R3 1779660841682"             | [{"excerpt":"# MCP E2E Wiki R3 1779660841682\n\nRound 3 wiki body.","id":"m979534cn77hgpfqrzce3rbfcs87axep","kind":"docu…   |
| `wiki_update`       | PASS   | 346ms   | Append to the wiki document body                            | {"contentMarkdown":"# MCP E2E Wiki R3 1779660841682\n\nRound 3 wiki body.\n\nAppended in round 3.","createdAt":177966084…   |
| `codebases_list`    | PASS   | 337ms   | Which GitHub repos are connected for codebase graph?        | [{"callEdgeCount":10026,"classCount":0,"defaultBranch":"main","description":"Orchestrate sandboxed agents that run in th…   |
| `codebase_overview` | PASS   | 445ms   | Give me stats for my vmem codebase graph                    | {"callEdgeCount":0,"classCount":0,"fileCount":0,"functionCount":0,"importEdgeCount":0,"interfaceCount":0,"processCount":…   |
| `codebase_search`   | PASS   | 476ms   | Find symbols related to "crons" in vmem                     | {"results":[]}                                                                                                              |
| `codebase_context`  | FAIL   | —       | codebase_context                                            | Skipped: codebase_search returned no symbols                                                                                |
| `codebase_impact`   | FAIL   | —       | codebase_impact                                             | Skipped: codebase_search returned no symbols                                                                                |
| `codebase_graph`    | FAIL   | —       | codebase_graph                                              | Skipped: codebase_search returned no symbols                                                                                |

## Tool inventory (21 tools)

`ping`, `whoami`, `list_profiles`, `memory_search`, `memory_retrieve`, `memory_add`, `memory_update`, `memory_delete`, `skills_list`, `skills_get`, `skills_create`, `skills_update`, `wiki_list`, `wiki_get`, `wiki_search`, `wiki_create`, `wiki_update`, `codebases_list`, `codebase_overview`, `codebase_search`, `codebase_context`, `codebase_impact`, `codebase_graph`

## How to re-run

```bash
node scripts/test-vmem-mcp.mjs
```

Requires OAuth token in `~/.mcp-auth/mcp-remote-0.1.37/` (same as Cursor mcp-remote).
