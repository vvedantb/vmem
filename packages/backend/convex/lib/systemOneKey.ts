import { readSystemOneApiKey } from "../../engine/llm/systemOneClient";

/** Deployment `process.env` only (`AI_GATEWAY_API_KEY`). */
export function resolveSystemOneApiKey(): string | undefined {
  return readSystemOneApiKey();
}
