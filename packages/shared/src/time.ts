export const DEFAULT_LOCAL_TIME = "04:00";

/** Parse "HH:MM" → hour/minute. Returns null on malformed input. */
export function parseHHMM(
  time: string,
): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Storage is "HH:MM" UTC; pickers render local time. These helpers
 * shift between the two via today's date, so DST is applied consistently
 * with what the user sees at scheduling time.
 */
export function utcTimeToLocal(utcTime: string): string {
  const parsed = parseHHMM(utcTime);
  if (!parsed) return DEFAULT_LOCAL_TIME;
  const d = new Date();
  d.setUTCHours(parsed.hour, parsed.minute, 0, 0);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function localTimeToUtc(localTime: string): string | null {
  const parsed = parseHHMM(localTime);
  if (!parsed) return null;
  const d = new Date();
  d.setHours(parsed.hour, parsed.minute, 0, 0);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
