import { VMemory, type StructuredCreateMemoryInput } from "@vmem/sdk";
import type { Settings } from "./settings-schema";
import type { MemoryDraft } from "./summarise";

const DEFAULT_BASE_URL = "https://clear-bear-690.eu-west-1.convex.site";

export interface ClientConfig {
  /** A `vmem_sk_...` API key or a Clerk OAuth access token. Both go out as a Bearer token. */
  apiKey: string;
  baseUrl: string;
}

/** `VMEM_BASE_URL` points tests and dev builds at another host. There is no setting for it. */
export function resolveBaseUrl(
  env: Readonly<Record<string, string | undefined>>,
): string {
  return env["VMEM_BASE_URL"] || DEFAULT_BASE_URL;
}

/**
 * Picks the credential. `VMEM_API_KEY` (tests) wins, then the Clerk access
 * token from sign-in, then a key saved by an older install.
 */
export function resolveClientConfig(
  settings: Settings,
  env: Readonly<Record<string, string | undefined>>,
  oauthAccessToken: string | null = null,
): ClientConfig | null {
  const apiKey =
    env["VMEM_API_KEY"] || oauthAccessToken || settings.apiKey.trim();
  return apiKey ? { apiKey, baseUrl: resolveBaseUrl(env) } : null;
}

function toCreateInput(draft: MemoryDraft): StructuredCreateMemoryInput {
  return {
    title: draft.title,
    content: draft.content,
    type: "episodic",
    source: "desktop",
    sourceType: "desktop",
    tags: [...new Set(["desktop", ...draft.tags])],
  };
}

export function createPoster(
  config: ClientConfig,
): (draft: MemoryDraft) => Promise<void> {
  const client = new VMemory({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
  return async (draft) => {
    await client.createMemory(toCreateInput(draft));
  };
}
