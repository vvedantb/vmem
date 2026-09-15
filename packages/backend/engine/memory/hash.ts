function normalizeMemoryHashInput(title: string, content: string): string {
  return `${title}\n${content}`.trim().replace(/\s+/g, " ").toLowerCase();
}

function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function computeContentHash(title: string, content: string): string {
  const input = normalizeMemoryHashInput(title, content);
  // Four 8-hex FNV-1a rounds → 32 hex chars without node:crypto.
  const parts = [
    0x811c9dc5,
    0x811c9dc5 ^ 0x9e3779b9,
    0x811c9dc5 ^ 0x85ebca6b,
    0x811c9dc5 ^ 0xc2b2ae35,
  ];
  return parts
    .map((seed) =>
      fnv1a32(`${seed}:${input}`, seed).toString(16).padStart(8, "0"),
    )
    .join("")
    .slice(0, 32);
}
