# vmem — Backend

The memory API server powering vmem. Handles storage, retrieval, semantic search, and MCP integration for cross-model memory access.

## Planned Stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **Database:** PostgreSQL + pgvector for vector embeddings
- **Embeddings:** OpenAI embedding models
- **Protocol:** REST API + MCP (Model Context Protocol)

## Planned Features

- CRUD APIs for memory records
- Vector embedding pipeline for semantic search
- MCP connector for cross-model consumption (Claude, ChatGPT, etc.)
- User authentication and access control
- Metadata support (timestamps, tags, relational context)
- Memory update rules to handle stale/conflicting information

## Status

Not yet implemented — currently in planning phase.
