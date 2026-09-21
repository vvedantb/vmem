<!-- AI-generated (Claude), prompt: "write install and quick start for vmem sdk" -->
<!-- Modified by me: aligned examples with current api key flow -->

# @vmem/sdk

Official JavaScript SDK for the [vmem](https://github.com/vvedantb/vmem) memory API. Save, update, and search user memories over HTTP with API key auth.

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

await vmem.save("User switched from Neovim to Helix");
await vmem.update("Actually they use Zed now, not Helix");

const result = await vmem.search("What editor does the user prefer?");
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
- **OpenRouter key** (dashboard env) — required for agentic `save()` / `update()`. Those calls return HTTP 422 `{ error: "openrouter_required" }` when the key is missing. When set, vmem also embeds memories on write and can blend vector similarity into retrieve. `search({ summarize: true })` joins ranked titles (no LLM, no 422).

## API

| Method                    | Description                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `save(instruction)`       | Requires OpenRouter; 422 `openrouter_required` without it                                                                                                                |
| `update(instruction)`     | Same OpenRouter gate as `save()`                                                                                                                                         |
| `search(query, options?)` | Hybrid retrieve; `type`/`tags`/`status` filters; `summarize: true` joins titles; Jev rerank when the deployment has `TYPESAFE_API_KEY` (`judge: "off"` is ablation-only) |
| `createMemory(body)`      | Structured create (escape hatch)                                                                                                                                         |
| `patchMemory(body)`       | Structured update by `id`                                                                                                                                                |
| `deleteMemory(body)`      | Structured delete by `id`                                                                                                                                                |
| `searchMemories(body)`    | Structured search                                                                                                                                                        |
| `health()`                | `GET /health` (unauthenticated liveness check)                                                                                                                           |

## Errors

```typescript
import { VMemory, isVMemoryError } from "@vmem/sdk";

try {
  await vmem.save("...");
} catch (error) {
  if (isVMemoryError(error) && error.code === "openrouter_required") {
    // Set OPENROUTER_API_KEY on the Convex deployment
  }
}
```

## Docs

- SDK quickstart: [`apps/docs/sdk/quickstart.mdx`](../../apps/docs/sdk/quickstart.mdx)
- HTTP Memories API: [`apps/docs/api-reference/http-memories.mdx`](../../apps/docs/api-reference/http-memories.mdx)

Preview locally with `pnpm docs:dev`. Product UI: [vmem-staging.vedantb.com](https://vmem-staging.vedantb.com).

## License

MIT
