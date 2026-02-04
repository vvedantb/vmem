# vmem — LLM Memory Layer

A universal, model-agnostic memory layer that lets any AI store, retrieve, and update user knowledge across sessions and platforms. Built as a Final Year Project at City, University of London.

## Problem

LLMs lack persistent long-term memory. Users repeat themselves across sessions, lose personalisation when switching models, and have no control over what AI remembers. Existing solutions (Mem0, GPT memory) are proprietary and locked to single ecosystems.

## Solution

vmem provides a centralised memory server accessible via REST API and MCP (Model Context Protocol), enabling any LLM to read/write user memories with semantic search, metadata tagging, and a graph-based UI for browsing and managing stored knowledge.

## Project Structure

| Folder | Description | Stack |
|---|---|---|
| [`web/`](./web) | Web dashboard for browsing, editing, and visualising memories | Next.js 16, React 19, TypeScript, Tailwind CSS, HeroUI |
| [`backend/`](./backend) | Memory API server with vector search and MCP integration | Java, Spring Boot (planned) |
| [`mobile/`](./mobile) | Mobile companion app | Planned |
| [`chrome-extension/`](./chrome-extension) | Browser extension for capturing and recalling memories | Planned |
| `internal/` | Project documentation and planning | Markdown |

## Getting Started

```bash
# Web app
cd web
pnpm install
pnpm dev
```

See each subfolder's README for more details.
