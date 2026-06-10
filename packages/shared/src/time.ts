export const DEFAULT_LOCAL_TIME = "04:00";

/**
 * Storage is "HH:MM" UTC; pickers render local time. These helpers
 * shift between the two via today's date, so DST is applied consistently
 * with what the user sees at scheduling time.
 */
export function utcTimeToLocal(utcTime: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(utcTime);
  if (!match) return DEFAULT_LOCAL_TIME;
  const d = new Date();
  d.setUTCHours(Number(match[1]), Number(match[2]), 0, 0);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function localTimeToUtc(localTime: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
