/** "under 1 min", "25 min", "1 h", "1 h 5 min" (same wording as the desktop recorder). */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(rest)} min`;
}

/** "2026-01-05 10:02" in UTC. */
export function utcStamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

/** "10:02" in UTC. */
export function utcClock(ms: number): string {
  return utcStamp(ms).slice(11);
}

/** "2026-01-05 10:02 to 10:48 UTC", with the end date when it differs. */
export function utcRange(startMs: number, endMs: number): string {
  const start = utcStamp(startMs);
  const end = utcStamp(endMs);
  const sameDay = start.slice(0, 10) === end.slice(0, 10);
  return `${start} to ${sameDay ? end.slice(11) : end} UTC`;
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Cuts at `max` characters with an ellipsis. */
export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * cyrb53: a fast 53-bit string hash, as 14 hex digits. Used for stable
 * `externalId`s, not for security.
 */
export function hash53(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, "0");
}
