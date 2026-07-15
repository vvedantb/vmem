<!-- AI-generated (Claude), prompt: "document the shared package role in vmem" -->
<!-- Modified by me: clarified what belongs versus stays in backend -->

# @vmem/shared

Cross-app constants and client-safe prompt helpers. Pure TypeScript — no Convex, Neo4j, or React.

## What belongs here

- Constants shared by web, extension, and backend (e.g. `PARSER_VERSION`)
- Client-safe string builders (skills index for MCP context prompts)
- Types exported alongside those helpers

## What does not belong here

- Convex `api` / `internal` — use `@vmem/backend`
- Server-only enrichment or Neo4j prompts — stay in `packages/backend/convex/prompts/`

## Import rule

Client apps (`web`, `chrome-extension`) may import only:

- `@vmem/backend` — Convex contract (`api`, `Doc`, `Id`, …)
- `@vmem/shared` — this package

Do not use `@vmem/backend/*` subpaths from client code.

## Exports

| Export                     | Use                                                     |
| -------------------------- | ------------------------------------------------------- |
| `PARSER_VERSION`           | Codebase parser version; bump to trigger re-sync banner |
| `buildSkillsIndexAddition` | Push skills index (name + description) into prompts     |

## Layout

```
packages/shared/src/
├── index.ts              # public barrel
├── codebase.ts
├── envParse.ts
├── skillSegments.ts
├── time.ts
└── prompts/
    └── memoryRagPrompt.ts
```
