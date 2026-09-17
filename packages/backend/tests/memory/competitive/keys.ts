import { readSystemOneApiKey } from "../../../engine/llm/systemOneClient";

export const MEM0_API_KEY_ENV = "MEM0_API_KEY";
export const SUPERMEMORY_API_KEY_ENV = "SUPERMEMORY_API_KEY";

export const MEM0_SIGNUP_URL = "https://app.mem0.ai";
export const SUPERMEMORY_SIGNUP_URL = "https://console.supermemory.ai";

export const COMPETITIVE_SCOPE = "vmem_labelled_ir";

export const EVAL_COMPETITIVE_KEYS_REQUIRED = [
  "EVAL_COMPETITIVE requires live vendor keys. Missing:",
  `  ${MEM0_API_KEY_ENV}  (Mem0 Platform — ${MEM0_SIGNUP_URL} → Settings → API keys)`,
  `  ${SUPERMEMORY_API_KEY_ENV}  (SuperMemory — ${SUPERMEMORY_SIGNUP_URL} → API keys)`,
  "Signup is interactive (email/GitHub/Google). There is no public signup API.",
  "Do not invent recall/MRR/nDCG numbers. Leave table cells as — until a live run.",
  "Optional vmem Jev column: TYPESAFE_API_KEY (or TYPESAFE_AI_API_KEY / JEV_API_KEY) from https://platform.typesafe.ai.",
].join("\n");

export function evalCompetitiveEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.EVAL_COMPETITIVE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function readTrimmedEnv(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readMem0ApiKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return readTrimmedEnv(MEM0_API_KEY_ENV, env);
}

export function readSupermemoryApiKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return readTrimmedEnv(SUPERMEMORY_API_KEY_ENV, env);
}

export function missingVendorKeyNames(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const missing: string[] = [];
  if (readMem0ApiKey(env) === undefined) missing.push(MEM0_API_KEY_ENV);
  if (readSupermemoryApiKey(env) === undefined) {
    missing.push(SUPERMEMORY_API_KEY_ENV);
  }
  return missing;
}

export function requireVendorKeys(
  env: Record<string, string | undefined> = process.env,
): { mem0: string; supermemory: string } {
  const mem0 = readMem0ApiKey(env);
  const supermemory = readSupermemoryApiKey(env);
  if (mem0 === undefined || supermemory === undefined) {
    throw new Error(EVAL_COMPETITIVE_KEYS_REQUIRED);
  }
  return { mem0, supermemory };
}

export function readOptionalJevKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return readSystemOneApiKey(env);
}

export function readPositiveIntEnv(
  name: string,
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const raw = readTrimmedEnv(name, env);
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
}

export function skipIngest(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.COMPETITIVE_SKIP_INGEST?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function vendorProductDefaults(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.COMPETITIVE_VENDOR_DEFAULTS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
