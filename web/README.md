# vmem — Web

The main web dashboard for vmem. Users can browse, search, edit, and visualise their stored memories through a graph-based UI.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **UI:** React 19, Tailwind CSS 3, HeroUI 2
- **Language:** TypeScript (strict mode)
- **Fonts:** Instrument Sans & Instrument Serif

## Key Routes

| Route | Description |
|---|---|
| `/dashboard` | Overview stats |
| `/memories/list` | Searchable memory list |
| `/memories/graph` | Graph visualisation |
| `/memories/tags` | Tag cloud |
| `/api/keys` | API key management |
| `/api/logs` | API request logs |
| `/chat` | Chat interface |
| `/connectors` | External integrations |
| `/files` | File management |
| `/settings` | User preferences |

## Setup

```bash
pnpm install
pnpm dev
```

## Architecture

- Server Components by default; Client Components only for interactive pieces (`"use client"`)
- Floating panel design with light/dark mode support
- Path alias: `@/*` maps to project root
