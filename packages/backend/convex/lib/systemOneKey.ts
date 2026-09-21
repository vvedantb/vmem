import type { ActionCtx } from "../_generated/server";
import { tryUserAndApiKeyByClerkId } from "./envVars";
import {
  readSystemOneApiKey,
  SYSTEMONE_API_KEY_ENV_NAMES,
} from "../../engine/llm/systemOneClient";

/** User secret first, then deployment `process.env`. Same resolution as retrieve. */
export async function resolveSystemOneApiKey(
  ctx: Pick<ActionCtx, "runQuery">,
  clerkId: string | undefined,
): Promise<string | undefined> {
  if (clerkId !== undefined) {
    for (const name of SYSTEMONE_API_KEY_ENV_NAMES) {
      const found = await tryUserAndApiKeyByClerkId(ctx, clerkId, name);
      if (found === null) continue;
      const trimmed = found.apiKey.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return readSystemOneApiKey();
}
