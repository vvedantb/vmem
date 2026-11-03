const DAY_MS = 86_400_000;

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function day(ms: number, nowMs: number): string {
  const date = new Date(ms);
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const start = new Date(ms);
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - start.getTime()) / DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "Today, 10:02 to 10:48" in the phone's time zone. */
export function localRange(
  startMs: number,
  endMs: number,
  nowMs = Date.now(),
): string {
  const start = `${day(startMs, nowMs)}, ${clock(startMs)}`;
  if (endMs - startMs < 60_000) return start;
  return `${start} to ${clock(endMs)}`;
}
