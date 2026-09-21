import { readSystemOneApiKey } from "../../engine/llm/systemOneClient";

/** Deployment `process.env` only (`TYPESAFE_API_KEY` / aliases). */
export function resolveSystemOneApiKey(): string | undefined {
  return readSystemOneApiKey();
}
