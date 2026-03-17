# Docs Architecture for Agent Orchestration

## Context

Building a platform to orchestrate agents. Agents need structured docs (requirements, user flows) to behave deterministically. Business team manages these docs, not engineers.

## Requirements

- Docs define requirements and user flows in a structured way
- Model reads docs to become deterministic in its behavior
- Business team must be able to edit docs without engineering involvement
- Docs must render inside the app's own layout (sidebar tab → main content area), not as a standalone site

## Options Evaluated

### Mintlify + MCP Server

- Auto-generates MCP server from docs, hosted at `/mcp`
- Business team gets a nice editing UI
- Supports custom domain subdirectory (`yourdomain.com/docs`) via DNS proxy
- MCP search returns snippets; `/llms-full.txt` returns entire docs as one file
- **Rejected:** Cannot embed inside the app's own layout — always renders as a standalone page. Proxied at the DNS level, not a React component.

### Fumadocs (Next.js-native)

- Renders MDX inside your own Next.js layout (sidebar + main content)
- Lives in the `/app/docs` route of the codebase
- Full control over rendering, chunking, retrieval
- Business team editing requires a CMS layer (Notion, Contentlayer, or custom admin)
- No auto-generated MCP — need to build a simple API/MCP that reads from docs source
- **Best fit for our requirements**

### Other Next.js options

- Nextra — MDX-based docs on Next.js, similar to Fumadocs
- Roll your own with MDX + Next.js

## Decision

Use Fumadocs (or similar Next.js-native solution) to render docs inside the app shell.

## Trade-offs Accepted

- Lose Mintlify's auto-generated MCP → build our own (already building MCP for vmem)
- Lose Mintlify's editing UI → need a CMS layer for business team
- Gain full control over rendering, retrieval strategy, and in-app integration

## Open Questions

- Which CMS for business team editing? (Notion sync, Contentlayer, custom admin page)
- How to expose docs to agents? (Custom MCP server, direct API, or inject full doc into system prompt)
- Chunking strategy for agent retrieval — full doc vs section-level
