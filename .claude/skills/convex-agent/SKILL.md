---
name: convex-dev-agent
description: Build AI agents with message history, vector search, and long-running workflows that stay reactive to your Convex database changes. Use this skill whenever the user mentions ai, agent, ai agent. Also trigger when discussing build ai agents with persistent memory, ai agent with vector search capabilities, even if they don't explicitly ask for AI Agent.
---

# AI Agent

## Instructions

Use AI Agent to build ai agents with message history, vector search, and long-running workflows that stay reactive to your convex database changes. This Convex component integrates directly with your backend.

### Installation

```bash
npm install @convex-dev/agent
```

### Capabilities

- Build agentic workflows that persist across user sessions without losing database reactivity
- Get built-in message history and vector search without managing separate infrastructure
- Separate long-running AI processes from UI while maintaining real-time updates
- Leverage Convex's reactive subscriptions for AI agents that respond to data changes

## Examples

### how to build AI agents with persistent memory

The Convex AI Agent component provides built-in message history storage that persists across sessions. Your agents maintain conversation context and can reference previous interactions while staying synchronized with your database state.

### AI agent with vector search capabilities

This component includes integrated vector search functionality for semantic retrieval within agent workflows. Agents can search through documents, previous conversations, or knowledge bases using embeddings without setting up separate vector databases.

### long running AI workflows without blocking UI

The component separates AI agent execution from your user interface using Convex's reactive architecture. Users get real-time updates on agent progress while the AI processes run independently in the background.

### reactive AI agents that respond to database changes

Agents built with this component can subscribe to Convex database changes and trigger actions automatically. When your data updates, agents can respond immediately without polling or manual triggers.

## When NOT to use

- When a simpler built-in solution exists for your specific use case
- If you are not using Convex as your backend
- When the functionality provided by AI Agent is not needed

## Troubleshooting

**How does the AI Agent component handle message persistence?**

The Convex AI Agent component automatically stores conversation history in your Convex database with full ACID guarantees. Message threads persist across user sessions and remain queryable, with built-in indexing for fast retrieval during agent reasoning.

**Can AI agents react to real-time database changes?**

Yes, agents built with the Convex AI Agent component can subscribe to database mutations and trigger workflows automatically. This enables agents that respond immediately to new data, user actions, or external events without polling.

**What vector search capabilities are included?**

The AI Agent component includes built-in vector search powered by Convex's vector database features. Agents can perform semantic search over documents, conversation history, or custom embeddings without managing separate vector infrastructure.

**How do long-running agent workflows work?**

The Convex AI Agent component runs workflows as background processes that don't block your UI. Agents can execute multi-step reasoning, make API calls, and update state over time while users receive real-time progress updates through Convex's reactive subscriptions.

**Do I need to manage separate infrastructure for AI agents?**

No, the Convex AI Agent component runs entirely within your existing Convex backend. Message storage, vector search, and workflow execution all use Convex's infrastructure, eliminating the need for additional databases or orchestration tools.

## Resources

- [npm package](https://www.npmjs.com/package/%40convex-dev%2Fagent)
- [GitHub repository](https://github.com/get-convex/agent)
- [Live demo](https://docs.convex.dev/agents)
- [Convex Components Directory](https://www.convex.dev/components/agent)
- [Convex documentation](https://docs.convex.dev)
