# vmem vs Supermemory — Deep Analysis

Date: 2026-04-01

## Supermemory's Stack

| Layer          | Technology                                                       |
| -------------- | ---------------------------------------------------------------- |
| API            | Hono on Cloudflare Workers                                       |
| Vector Engine  | Custom, built on Cloudflare Durable Objects (one DB per user)    |
| Relational DB  | Cloudflare D1 (SQLite at edge) + Drizzle ORM                     |
| Object Storage | Cloudflare R2                                                    |
| Vector Index   | Cloudflare Vectorize (1536 dims, cosine metric)                  |
| Auth           | better-auth (session + bearer token)                             |
| Payments       | LemonSqueezy                                                     |
| Monorepo       | Turborepo + Bun + Biome                                          |
| Graph          | Graph-on-relational with typed edges (UPDATES, EXTENDS, DERIVES) |

## Supermemory's Features

- Vector-graph hybrid architecture
- Sub-300ms recall (claims 25x faster than Mem0)
- Connectors: Google Drive, Gmail, Notion, OneDrive, GitHub, Slack, S3 (real-time webhooks)
- Multi-modal extraction: PDFs, images, audio, video, web pages
- Auto-built user profiles from conversation patterns
- Infinite Chat API: conversation-aware context injection per-turn
- Intelligent decay: irrelevant memories fade automatically
- Contradiction resolution via UPDATES edges (auto-detects, links old → new, marks isLatest)
- SUPERSEDES pattern: old knowledge preserved, not deleted
- Auto-extraction of facts from conversations
- TypeScript + Python SDKs
- Framework integrations: Vercel AI SDK, LangChain, LangGraph, CrewAI, OpenAI SDK, Mastra, Zapier, n8n
- MCP server + plugins for Claude Code, OpenCode, Cursor
- Self-hosted VPC deployment option for enterprise
- SOC 2, HIPAA, GDPR compliance
- Benchmarked: 85.2% LongMemEval, #1 on LoCoMo and ConvoMem
- ~17k GitHub stars, funded company, paying customers

## Where Supermemory Wins Over vmem

### 1. Semantic Search (biggest gap)

Vector embeddings + hybrid search + query rewriting + reranking. "What did I say about that project with the tight deadline" matches even when the memory says "Sprint 4 has a March 1st cutoff." vmem uses fulltext search only — keyword overlap required.

### 2. Connectors & Auto-Sync

Pulls from Google Drive, Gmail, Notion, OneDrive, GitHub, Slack, S3 with real-time webhooks. vmem requires manual save (Chrome extension, API call, or MCP tool).

### 3. Multi-Modal Extraction

Processes PDFs, images, audio, video, web pages with smart chunking. vmem stores text only.

### 4. Auto-Built User Profiles

Automatically constructs dynamic user profiles (preferences, behaviors, goals) from conversation patterns. vmem has memory types but requires manual categorization.

### 5. Infinite Chat API

Manages memory inline with conversation history — decides what context to inject per-turn, reducing token usage. vmem returns top-N matches to a query with no conversation awareness.

### 6. Intelligent Decay

Auto-forgets irrelevant memories. "Best laundry detergent" fades; "allergic to peanuts" persists. vmem has expiresAt but no automatic decay logic.

### 7. Contradiction Resolution

Auto-detects conflicting facts via graph UPDATES edges. vmem has Proposed Updates architecture but auto-detection trigger not wired up.

### 8. SDK & Integration Ecosystem

TypeScript + Python SDKs, plus Vercel AI SDK, LangChain, LangGraph, CrewAI, OpenAI SDK, Mastra, Zapier, n8n. vmem has REST API + MCP server only.

### 9. Scale & Benchmarking

100B+ tokens/month in production, P95 <300ms, benchmarked on LongMemEval/LoCoMo/ConvoMem. vmem has zero benchmarks.

### 10. Enterprise Readiness

Self-hosted VPC, SOC 2, HIPAA, GDPR, SSO. vmem is a masters project with no compliance.

## What Supermemory CAN Do (corrected assumptions)

- Contradiction detection via UPDATES edges (not just text similarity)
- SUPERSEDES pattern: old knowledge preserved via UPDATES relationships
- Auto-extract facts from conversations
- Relationship building via UPDATES, EXTENDS, DERIVES edges automatically

## What Supermemory CAN'T Do

- Multi-hop graph traversal (no API for walking N hops, retrieval is similarity-based)
- Community detection / clustering (no Louvain or label propagation)
- Graph-distance-weighted retrieval scoring (no hybrid score combining vector similarity + graph proximity)
- Temporal evolution queries ("how did my understanding of X evolve?" — history preserved but not queryable)

## Where vmem Wins Over Supermemory

### Product Vision (not database)

The competitive advantage is product decisions, not Neo4j vs their stack:

1. **Memory as a first-class user experience** — Supermemory treats memory as invisible infrastructure. vmem lets users see, understand, and govern their AI's memory. Graph viz, Context Trace, Proposed Updates, timeline diffs — a product category Supermemory isn't competing in.

2. **Path-based explanations (Neo4j-native)** — Instead of "matched 85% similarity," vmem can say: "I brought up your peanut allergy because you asked about cooking dinner → you're cooking for Sarah → Sarah is allergic to peanuts." Graph path rendered as human-readable reasoning chain. Supermemory's retrieval doesn't walk paths.

3. **Self-hosted / data sovereignty** — Neo4j runs locally. Memories never leave the user's machine. Supermemory is cloud-dependent (despite enterprise VPC option).

4. **User-as-curator vs user-as-passenger** — Supermemory decides what to remember/forget/resolve. vmem lets users approve/reject proposed changes, pin/suppress memories, explore the graph to discover forgotten connections.

## Strategic Conclusion

Stop trying to beat Supermemory at being Supermemory. They have more features, more polish, more funding, and their architecture handles "invisible memory API" well.

Beat them by being the product for users who want to understand and control their AI's memory. That's a real market (power users, developers, privacy-conscious users, enterprise compliance) that Supermemory is actively choosing not to serve.

## Minimum Gaps to Close

1. **Vector embeddings** — Add Neo4j vector index. Closes the biggest functional gap.
2. **Auto-extraction** — LLM call on MCP messages to pull structured memories without user action.
3. **Neighbourhood retrieval** — On every retrieve, walk 1-2 hops and return connected memories with the path.
4. **Graph-aware contradiction detection** — Use entity subgraph as context for LLM contradiction check.

## Neo4j Was the Right Call

The graph viz, relationship traversal, path-based explanations, and schema-free edges justify Neo4j. Postgres could technically do it all but with more friction. The graph IS the product for vmem's vision.

The advantage isn't "Neo4j is a better database" — it's "Neo4j makes it easier to build the product vmem wants to be."
