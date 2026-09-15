import crypto from "node:crypto";

function normalizeMemoryHashInput(title: string, content: string): string {
  return `${title}\n${content}`.trim().replace(/\s+/g, " ").toLowerCase();
}

export function computeContentHash(title: string, content: string): string {
  return crypto
    .createHash("md5")
    .update(normalizeMemoryHashInput(title, content))
    .digest("hex");
}
