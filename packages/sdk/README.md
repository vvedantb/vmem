# @vmem/sdk

Official JavaScript SDK for the [vmem](https://github.com/vedantb2/vmem) memory API. Store, update, and retrieve user memories over HTTP with API key auth.

## Install

```bash
npm install @vmem/sdk
```

## Quick start

1. Create an API key in the vmem dashboard (**Settings → API → Keys**).
2. Set environment variables (or pass options to the constructor):

```bash
export VMEM_API_KEY="vmem_sk_..."
export VMEM_BASE_URL="https://<your-deployment>.convex.site"
```

3. Use the agentic API:

```typescript
import { VMemory } from "@vmem/sdk";

const vmem = new VMemory();

await vmem.store("User switched from Neovim to Helix");
await vmem.update("Actually they use Zed now, not Helix");

const result = await vmem.retrieve("What editor does the user prefer?");
console.log(result.memories);
console.log(result.userContext);
```

Explicit options:

```typescript
const vmem = new VMemory({
  apiKey: process.env.VMEM_API_KEY,
  baseUrl: process.env.VMEM_BASE_URL,
  profileId: "optional-profile-id",
});
```

## Requirements

- **API key** (`VMEM_API_KEY` or `apiKey`) — required for all calls.
- **Base URL** (`VMEM_BASE_URL` or `baseUrl`) — your Convex site URL (`https://<deployment>.convex.site`).
- **OpenRouter key** (dashboard env) — required for agentic `store()` and `update()`, and for `retrieve({ summarize: true })`.

## API

| Method                      | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| `store(instruction)`        | Extract facts from natural language and create memories |
| `update(instruction)`       | Reconcile changes; conflicting updates become proposals |
| `retrieve(query, options?)` | Hybrid semantic search; optional `summarize: true`      |
| `createMemory(body)`        | Structured create (escape hatch)                        |
| `patchMemory(body)`         | Structured update by `memoryId`                         |
| `searchMemories(body)`      | Structured retrieve                                     |

## Errors

```typescript
import { VMemory, isVMemoryError } from "@vmem/sdk";

try {
  await vmem.store("...");
} catch (error) {
  if (isVMemoryError(error) && error.code === "openrouter_required") {
    // Add OPENROUTER_API_KEY in vmem dashboard settings
  }
}
```

## Docs

- [SDK quickstart](https://github.com/vedantb2/vmem/blob/main/apps/docs/sdk/quickstart.mdx)
- [HTTP Memories API](https://github.com/vedantb2/vmem/blob/main/apps/docs/api-reference/http-memories.mdx)

## License

MIT
