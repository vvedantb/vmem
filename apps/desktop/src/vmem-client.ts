import { VMemory, type StructuredCreateMemoryInput } from "@vmem/sdk";
import type { Settings } from "./settings-schema";
import type { MemoryDraft } from "./summarise";

const DEFAULT_BASE_URL = "https://clear-bear-690.eu-west-1.convex.site";

type Env = Readonly<Record<string, string | undefined>>;

/** `VMEM_BASE_URL` points tests and dev builds at another host. There is no setting for it. */
export function resolveBaseUrl(env: Env): string {
  return env["VMEM_BASE_URL"] || DEFAULT_BASE_URL;
}

/** A `vmem_sk_...` key that needs no session: `VMEM_API_KEY` (tests), else a key saved by an older install. */
export function staticApiKey(settings: Settings, env: Env): string | null {
  return env["VMEM_API_KEY"] || settings.apiKey.trim() || null;
}

/** True when uploads can authenticate. Without credentials the app records nothing (see can-record.ts). */
export function hasCredentials(
  settings: Settings,
  env: Env,
  signedIn: boolean,
): boolean {
  return signedIn || staticApiKey(settings, env) !== null;
}

/**
 * The Bearer token for one upload. `VMEM_API_KEY` wins, then the session token from sign-in, then a key saved
 * by an older install (sign-in removes that key).
 */
export async function resolveBearer(
  settings: Settings,
  env: Env,
  sessionToken: () => Promise<string | null>,
): Promise<string | null> {
  const envKey = env["VMEM_API_KEY"];
  if (envKey) return envKey;
  return (await sessionToken()) ?? staticApiKey(settings, env);
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

/**
 * Posts each draft with `POST /api/v1/memories`. It gets the Bearer token again for every post, because a session
 * token lives about a minute and one flush can post many drafts. With no token the post throws, so the events stay
 * queued for the next flush.
 */
export function createPoster(
  baseUrl: string,
  bearer: () => Promise<string | null>,
): (draft: MemoryDraft) => Promise<void> {
  return async (draft) => {
    const apiKey = await bearer();
    if (apiKey === null) throw new Error("Not signed in");
    await new VMemory({ apiKey, baseUrl }).createMemory(toCreateInput(draft));
  };
}
