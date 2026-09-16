export const DEFAULT_DOCS_URL = "http://localhost:3001";

export function e2eDocsURL(): string {
  return process.env.E2E_DOCS_URL ?? DEFAULT_DOCS_URL;
}
