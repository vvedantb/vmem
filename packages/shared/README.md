# @vmem/shared

Cross-app constants and client-safe prompt helpers. Pure TypeScript — no Convex, Neo4j, or React.

## What belongs here

- Constants shared by web, mobile, extension, and backend (e.g. `PARSER_VERSION`)
- String builders used in local chat, voice, and cloud chat system prompts
- Types exported alongside those helpers

## What does not belong here

- Convex `api` / `internal` — use `@vmem/backend`
- Server-only enrichment or Neo4j prompts — stay in `packages/backend/convex/prompts/`

## Import rule

Client apps (`web`, `mobile`, `chrome-extension`) may import only:

- `@vmem/backend` — Convex contract (`api`, `Doc`, `Id`, …)
- `@vmem/shared` — this package

Do not use `@vmem/backend/*` subpaths from client code.

## Exports

| Export                                                                      | Use                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `PARSER_VERSION`                                                            | Codebase parser version; bump to trigger re-sync banner     |
| `buildMemoryRagAddition`                                                    | Inject retrieved memories into a system prompt              |
| `buildSkillsIndexAddition`                                                  | Push enabled skills index (name + description) into prompts |
| `buildSkillInstructionsAddition`                                            | Lazy-load full skill instructions when referenced           |
| `buildLocalChatSystemPrompt` / `buildCloudChatSystemPrompt` / `buildVoice…` | Compose channel-specific system prompts                     |
| `findSkillsReferencedInMessage`                                             | Detect `@skill` mentions in user text                       |

## Layout

```
packages/shared/src/
├── index.ts              # public barrel
├── codebase.ts           # PARSER_VERSION
└── prompts/
    └── memoryRagPrompt.ts
```
