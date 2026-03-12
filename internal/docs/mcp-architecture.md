# MCP Architecture: Implicit Memory

## Core Principle

Memory should be implicit, not explicit. The LLM should never have to "decide" to remember — relevant context should already be present when it responds.

## MCP Primitives

MCP has three primitives. vmem uses all three differently:

| Primitive | Purpose                              | vmem Usage                                        |
| --------- | ------------------------------------ | ------------------------------------------------- |
| Resources | Context injected BEFORE LLM responds | Relevant memories auto-loaded into context        |
| Tools     | LLM explicitly calls them            | memory_write, memory_search — intentional actions |
| Prompts   | System prompt templates              | User profile, preferences, active project context |

## Reading Memories (Implicit)

```
User sends message to Claude/ChatGPT/Cursor
→ MCP client asks vmem: "what's relevant for this user?"
→ vmem returns top memories as Resources
→ LLM sees them as part of system prompt — no tool call
→ LLM responds with full memory context
```

The user and the LLM never explicitly "fetch" memories. They're just there.

## Writing Memories

Two modes:

1. **Explicit (Tools)** — LLM or user calls memory_write. Used for deliberate saves.
2. **Automatic (Background)** — Background process observes conversations and extracts memories without user/LLM intervention. This is the preferred mode.

Writing should be intentional or automatic. Reading should always be implicit.

## Why MCP is Still the Right Protocol

MCP is not just "tools the LLM calls." Resources and Prompts enable the implicit pattern vmem needs. The protocol supports:

- Auto-injecting context before inference (Resources)
- Background subscriptions for live memory updates
- Explicit tools only where intentional actions are needed (write, delete, approve conflict)

## MCP Tools (explicit — used sparingly)

- memory_write — store a new memory
- memory_search — direct search (for dashboard/human use)
- memory_update_proposal_review — approve/reject conflicts

## MCP Resources (implicit — the core pattern)

- user://memories/relevant — top N memories for current context
- user://profile — stable user facts/preferences
- user://project/{name} — active project context

## Comparison to Competitors

Mem0 and Supermemory are tool-only: the LLM must explicitly call `mem0.search()` or `memory.retrieve()` to get context. This means the LLM can forget to check memory, or waste tokens on tool calls.

vmem injects memory implicitly via MCP Resources. The LLM always has relevant context. No tool call overhead. No "forgetting to remember."
