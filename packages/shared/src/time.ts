import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export const DEFAULT_LOCAL_TIME = "04:00";

// parse "HH:MM" → hour/minute; null if malformed
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

// storage is UTC HH:MM; pickers show local — shift via today's date for DST
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

export function formatDate(dateInput: string | number): string {
  const date = dayjs(dateInput);
  if (!date.isValid()) {
    return typeof dateInput === "string" ? dateInput : "";
  }
  return date.format("MMM D, YYYY");
}

export function formatDateTime(dateInput: string | number): string {
  const date = dayjs(dateInput);
  if (!date.isValid()) {
    return typeof dateInput === "string" ? dateInput : "";
  }
  return date.format("MMM D, YYYY, h:mm A");
}

export function formatRelativeTime(
  dateInput: string | number | null | undefined,
  options: { empty?: string } = {},
): string {
  if (dateInput === null || dateInput === undefined || dateInput === 0) {
    return options.empty ?? "Never";
  }
  return dayjs(dateInput).fromNow();
}

export function formatCompactRelativeTime(dateInput: string | number): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateInput).getTime()) / 1000,
  );
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function formatTimeUntil(
  scheduledTime: number,
  options: { due?: string } = {},
): string {
  if (scheduledTime <= Date.now()) return options.due ?? "any moment";
  return dayjs(scheduledTime).fromNow();
}
