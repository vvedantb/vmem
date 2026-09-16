import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const e2eDir = dirname(fileURLToPath(import.meta.url));

export const AUTH_STATE_PATH = resolve(e2eDir, "../.auth/user.json");
export const DEFAULT_E2E_EMAIL = "eva@vedantb.com";
export const DEFAULT_E2E_BASE_URL = "https://vmem.vedantb.com";

export type E2ECredentials = {
  email: string;
  password: string;
};

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const start = value.at(0);
    const end = value.at(-1);
    if ((start === '"' && end === '"') || (start === "'" && end === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

// tiny dotenv loader so we do not add a dotenv dependency
export function loadE2EEnvFiles(): void {
  const files = [resolve(e2eDir, "../.env.local"), resolve(e2eDir, "../.env")];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = stripQuotes(line.slice(eq + 1).trim());
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function e2eBaseURL(): string {
  return process.env.E2E_BASE_URL ?? DEFAULT_E2E_BASE_URL;
}

export function readE2ECredentials(): E2ECredentials | undefined {
  const email = process.env.E2E_USER_EMAIL ?? DEFAULT_E2E_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (password === undefined || password.length === 0) return undefined;
  if (email.length === 0) return undefined;
  return { email, password };
}

export function hasE2ECredentials(): boolean {
  return readE2ECredentials() !== undefined;
}

export function requireE2ECredentials(): E2ECredentials {
  const creds = readE2ECredentials();
  if (creds === undefined) {
    throw new Error(
      "Missing E2E_USER_PASSWORD (and optionally E2E_USER_EMAIL). See e2e/README.md.",
    );
  }
  return creds;
}
